import { Billboard, Html, Line } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { buildCloud, zoneAnchors } from '../lib/body';
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

function Particles({ zones, statuses, lit, lensActive, selected, night }: Omit<BodyScanProps, 'cards' | 'onSelect'>) {
  const cloud = useMemo(() => buildCloud(zones), [zones]);
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(cloud.positions, 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(cloud.count * 3), 3));
    return g;
  }, [cloud]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  useEffect(() => {
    const theme = readTheme();
    const base = new THREE.Color(theme.muted).multiplyScalar(0.55);
    const accent = new THREE.Color(theme.accent);
    const wholeIndex = zones.findIndex((z) => z.id === 'whole_body');
    const wholeLit = lit.includes('whole_body');
    const wholeStatus = statuses.whole_body ?? 'nominal';
    const zoneColors = zones.map((z) => {
      const status = statuses[z.id] ?? 'nominal';
      const isLit = lit.includes(z.id);
      if (lensActive) return isLit ? accent.clone() : base.clone().multiplyScalar(0.22);
      if (status !== 'nominal') return new THREE.Color(statusColor(status, theme));
      if (selected === z.id) return accent.clone();
      return new THREE.Color(theme.text).multiplyScalar(0.62);
    });
    const colors = geometry.getAttribute('color') as THREE.BufferAttribute;
    const fallback = lensActive
      ? wholeLit
        ? accent.clone().multiplyScalar(0.5)
        : base.clone().multiplyScalar(0.22)
      : wholeStatus !== 'nominal'
        ? new THREE.Color(statusColor(wholeStatus, theme)).multiplyScalar(0.55)
        : selected === 'whole_body'
          ? accent.clone().multiplyScalar(0.6)
          : base;
    for (let i = 0; i < cloud.count; i++) {
      const zi = cloud.zoneOf[i] ?? -1;
      const c = zi >= 0 && zi !== wholeIndex ? (zoneColors[zi] ?? fallback) : fallback;
      colors.setXYZ(i, c.r, c.g, c.b);
    }
    colors.needsUpdate = true;
  }, [cloud, geometry, zones, statuses, lit, lensActive, selected, night]);

  return (
    <points geometry={geometry}>
      <pointsMaterial size={0.026} sizeAttenuation vertexColors transparent opacity={0.95} depthWrite={false} />
    </points>
  );
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
