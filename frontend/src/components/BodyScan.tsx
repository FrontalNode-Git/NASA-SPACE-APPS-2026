import { Billboard, Html, Line } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { buildCloud, INSIDE, PAD, SHELL, zoneAnchors } from '../lib/body';
import type { Status, Zone } from '../lib/types';
import { prefersReducedMotion, readTheme } from './Chart';
import { StatusGlyph } from './StatusGlyph';

export interface ScanCard {
  id: string;
  label: string;
  value: string;
  unit: string;
  status: Status;
}

export interface BodyScanProps {
  zones: Zone[];
  statuses: Record<string, Status>;
  /** Zone ids that stay lit under the hazard lens. */
  lit: string[];
  lensActive: boolean;
  selected: string | null;
  onSelect: (zone: string | null) => void;
  cards: ScanCard[];
  night: boolean;
}

type V3 = [number, number, number];

// Where each card floats and which point on the body its leader line starts from.
const CARD_LAYOUT: Record<string, { from: V3; to: V3 }> = {
  heart_rate: { from: [0.1, 0.92, 0.2], to: [1.25, 1.1, 0] },
  spo2: { from: [-0.16, 0.98, 0.2], to: [-1.25, 1.1, 0] },
  temperature: { from: [0, 1.7, 0.22], to: [1.2, 1.95, 0] },
};
const HOME: V3 = [0, 0, 6.2];
const HOME_LOOK: V3 = [0, 0.02, 0];

function statusColor(status: Status, theme: ReturnType<typeof readTheme>): string {
  return status === 'call_ground' ? theme.call : status === 'watch' ? theme.watch : theme.nominal;
}

// Round, soft particles. The skin is solid towards the viewer and faint on the far side, so
// the figure reads as a body instead of a see-through cloud; the skeleton and organs glow
// through it. A bright line travels up the body like a scanner.
const VERTEX = /* glsl */ `
  attribute vec3 aColor;
  attribute float aKind;
  uniform float uTime;
  uniform float uSweep;
  uniform float uHalfHeight;
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float alpha;
    float size;
    if (aKind < 0.5) {
      float facing = dot(normalize(normalMatrix * normal), normalize(-mv.xyz));
      float front = smoothstep(-0.2, 0.3, facing);
      float rim = pow(1.0 - abs(facing), 3.0);
      alpha = mix(0.06, 0.6, front) + rim * 0.3;
      size = 0.022;
    } else if (aKind < 1.5) {
      alpha = 0.6;
      size = 0.019;
    } else {
      alpha = 0.32;
      size = 0.022;
    }
    float line = mix(-2.0, 2.0, fract(uTime * 0.11));
    float band = aKind > 1.5 ? 0.0 : uSweep * exp(-pow((position.y - line) / 0.06, 2.0));

    vColor = aColor * (1.0 + band * 0.7);
    vAlpha = min(1.0, alpha + band * 0.16);
    gl_PointSize = max(1.6, size * (1.0 + band * 0.25) * projectionMatrix[1][1] * uHalfHeight / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;
const FRAGMENT = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    float edge = smoothstep(0.5, 0.3, length(gl_PointCoord - 0.5));
    if (edge < 0.02) discard;
    gl_FragColor = vec4(vColor, vAlpha * edge);
    #include <colorspace_fragment>
  }
`;

function Particles({ zones, statuses, lit, lensActive, selected, night }: Omit<BodyScanProps, 'cards' | 'onSelect'>) {
  const cloud = useMemo(() => buildCloud(zones), [zones]);
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(cloud.positions, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(cloud.normals, 3));
    g.setAttribute('aKind', new THREE.BufferAttribute(cloud.kinds, 1));
    g.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(cloud.count * 3), 3));
    return g;
  }, [cloud]);
  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uSweep: { value: 1 }, uHalfHeight: { value: 215 } }), []);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms,
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [uniforms],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  const reduced = prefersReducedMotion();
  useFrame(({ clock, size, gl }) => {
    uniforms.uTime.value = clock.elapsedTime;
    uniforms.uSweep.value = reduced ? 0 : 1;
    uniforms.uHalfHeight.value = size.height * gl.getPixelRatio() * 0.5;
  });

  useEffect(() => {
    const theme = readTheme();
    const base = new THREE.Color(theme.muted).multiplyScalar(0.6);
    const accent = new THREE.Color(theme.accent);
    const calm = new THREE.Color(theme.nominal).multiplyScalar(0.6); // a healthy skeleton and organs
    const faint = base.clone().multiplyScalar(0.22);
    const wholeIndex = zones.findIndex((z) => z.id === 'whole_body');
    const wholeLit = lit.includes('whole_body');
    const wholeStatus = statuses.whole_body ?? 'nominal';
    // What a zone looks like on the skin, and as a structure inside the body.
    const skinColors = zones.map((z) => {
      const status = statuses[z.id] ?? 'nominal';
      if (lensActive) return lit.includes(z.id) ? accent : faint;
      if (status !== 'nominal') return new THREE.Color(statusColor(status, theme));
      if (selected === z.id) return accent;
      return new THREE.Color(theme.text).multiplyScalar(0.66);
    });
    const insideColors = zones.map((z, i) => {
      const status = statuses[z.id] ?? 'nominal';
      return !lensActive && status === 'nominal' && selected !== z.id ? calm : (skinColors[i] ?? calm);
    });
    const fallback = lensActive
      ? wholeLit
        ? accent.clone().multiplyScalar(0.5)
        : faint
      : wholeStatus !== 'nominal'
        ? new THREE.Color(statusColor(wholeStatus, theme)).multiplyScalar(0.55)
        : selected === 'whole_body'
          ? accent.clone().multiplyScalar(0.6)
          : base;
    const padColor = lensActive ? faint : new THREE.Color(theme.muted).multiplyScalar(0.5);
    const colors = geometry.getAttribute('aColor') as THREE.BufferAttribute;
    const mixed = new THREE.Color();
    for (let i = 0; i < cloud.count; i++) {
      const kind = cloud.kinds[i] ?? SHELL;
      const zi = cloud.zoneOf[i] ?? -1;
      if (kind === PAD) mixed.copy(padColor);
      else if (kind === INSIDE) mixed.copy(insideColors[zi] ?? calm);
      else if (zi >= 0 && zi !== wholeIndex) mixed.copy(fallback).lerp(skinColors[zi] ?? fallback, cloud.zoneWeight[i] ?? 0);
      else mixed.copy(fallback);
      colors.setXYZ(i, mixed.r, mixed.g, mixed.b);
    }
    colors.needsUpdate = true;
  }, [cloud, geometry, zones, statuses, lit, lensActive, selected, night]);

  return <points geometry={geometry} material={material} frustumCulled={false} />;
}

/** Target marker: its outline repeats the status shape (circle / triangle / square). */
function Ring({ position, status, color, pulse }: { position: V3; status: Status | 'selected'; color: string; pulse: boolean }) {
  const mesh = useRef<THREE.Mesh>(null);
  const segments = status === 'watch' ? 3 : status === 'call_ground' ? 4 : 48;
  const start = status === 'watch' ? Math.PI / 2 : status === 'call_ground' ? Math.PI / 4 : 0;
  useFrame(({ clock }) => {
    if (!mesh.current) return;
    const k = pulse ? 1 + 0.16 * Math.sin(clock.elapsedTime * 3) : 1;
    mesh.current.scale.setScalar(k);
  });
  return (
    <Billboard position={position}>
      <mesh ref={mesh}>
        <ringGeometry args={[0.2, 0.225, segments, 1, start]} />
        <meshBasicMaterial color={color} transparent opacity={0.95} side={THREE.DoubleSide} depthTest={false} />
      </mesh>
    </Billboard>
  );
}

function Markers({ zones, statuses, lit, lensActive, selected, onSelect, night }: Omit<BodyScanProps, 'cards'>) {
  const theme = useMemo(() => readTheme(), [night]); // eslint-disable-line react-hooks/exhaustive-deps
  const reduced = prefersReducedMotion();
  return (
    <>
      {zones
        .filter((z) => z.id !== 'whole_body')
        .flatMap((zone) => {
          const status = statuses[zone.id] ?? 'nominal';
          const dim = lensActive && !lit.includes(zone.id);
          const isSelected = selected === zone.id;
          const color = isSelected ? theme.accent : status !== 'nominal' ? statusColor(status, theme) : theme.text;
          return zoneAnchors(zone).map((anchor, i) => (
            <group key={`${zone.id}-${i}`}>
              <mesh
                position={anchor}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(isSelected ? null : zone.id);
                }}
                onPointerOver={() => (document.body.style.cursor = 'pointer')}
                onPointerOut={() => (document.body.style.cursor = '')}
              >
                <sphereGeometry args={[0.15, 12, 12]} />
                <meshBasicMaterial transparent opacity={0} depthWrite={false} />
              </mesh>
              <mesh position={anchor}>
                <sphereGeometry args={[0.03, 12, 12]} />
                <meshBasicMaterial color={color} transparent opacity={dim ? 0.2 : 1} depthTest={false} />
              </mesh>
              {!dim && (status !== 'nominal' || isSelected) && (
                <Ring
                  position={anchor}
                  status={status !== 'nominal' ? status : 'selected'}
                  color={color}
                  pulse={!reduced && status !== 'nominal'}
                />
              )}
            </group>
          ));
        })}
    </>
  );
}

function Cards({ cards, night }: { cards: ScanCard[]; night: boolean }) {
  const theme = useMemo(() => readTheme(), [night]); // eslint-disable-line react-hooks/exhaustive-deps
  const width = useThree((s) => s.size.width);
  if (width < 400) return null; // phones: the indicator cards below carry the same values
  return (
    <>
      {cards.map((card) => {
        const layout = CARD_LAYOUT[card.id];
        if (!layout) return null;
        return (
          <group key={card.id}>
            <Line points={[layout.from, layout.to]} color={theme.muted} lineWidth={1} transparent opacity={0.7} />
            <Html position={layout.to} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
              <div className="w-[118px] rounded-lg border border-line/80 bg-panel/60 px-2.5 py-1.5 text-ink shadow-lg backdrop-blur-md">
                <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted">
                  <StatusGlyph status={card.status} size={9} />
                  <span className="truncate">{card.label}</span>
                </div>
                <div className="font-display text-lg font-bold leading-tight tabular-nums">
                  {card.value} <span className="text-xs font-normal text-muted">{card.unit}</span>
                </div>
              </div>
            </Html>
          </group>
        );
      })}
    </>
  );
}

function Rig({ zones, selected }: { zones: Zone[]; selected: string | null }) {
  const look = useRef(new THREE.Vector3(...HOME_LOOK));
  const reduced = prefersReducedMotion();
  const { goal, goalLook } = useMemo(() => {
    const zone = zones.find((z) => z.id === selected && z.id !== 'whole_body');
    if (!zone) return { goal: new THREE.Vector3(...HOME), goalLook: new THREE.Vector3(...HOME_LOOK) };
    const [x, y] = zone.anchor;
    return { goal: new THREE.Vector3(x * 0.5, y * 0.85, 3.1), goalLook: new THREE.Vector3(x * 0.6, y * 0.8, 0) };
  }, [zones, selected]);
  useFrame(({ camera }, delta) => {
    const k = reduced ? 1 : Math.min(1, delta * 3.5);
    camera.position.lerp(goal, k);
    look.current.lerp(goalLook, k);
    camera.lookAt(look.current);
  });
  return null;
}

function Sway({ children, still }: { children: React.ReactNode; still: boolean }) {
  const group = useRef<THREE.Group>(null);
  useFrame(({ clock }, delta) => {
    if (!group.current) return;
    const target = still ? 0 : Math.sin(clock.elapsedTime * 0.3) * 0.32;
    group.current.rotation.y += (target - group.current.rotation.y) * Math.min(1, delta * 4);
  });
  return <group ref={group}>{children}</group>;
}

/** Particle body scan. Rendering pauses while the tab is hidden; DPR is capped at 1.5. */
export default function BodyScan(props: BodyScanProps) {
  const [hidden, setHidden] = useState(document.hidden);
  useEffect(() => {
    const onChange = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);
  const still = prefersReducedMotion() || props.selected !== null;

  return (
    <Canvas
      dpr={[1, 1.5]}
      frameloop={hidden ? 'never' : 'always'}
      camera={{ position: HOME, fov: 38, near: 0.1, far: 50 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
      onPointerMissed={() => props.onSelect(null)}
      aria-hidden="true"
    >
      <Rig zones={props.zones} selected={props.selected} />
      <Sway still={still}>
        <Particles {...props} />
        <Markers {...props} />
        <Cards cards={props.cards} night={props.night} />
      </Sway>
    </Canvas>
  );
}
