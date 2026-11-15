import { useEffect, useState } from 'react';

/** Below Tailwind's `md` breakpoint: the width at which the dashboard switches to compact vitals. */
const QUERY = '(max-width: 767px)';

function matches(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.(QUERY).matches === true;
}

/** True on a phone-sized screen. Follows the window as it is resized or rotated. */
export function usePhone(): boolean {
  const [phone, setPhone] = useState(matches);
  useEffect(() => {
    const media = window.matchMedia?.(QUERY);
    if (!media) return;
    const onChange = () => setPhone(media.matches);
    onChange();
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);
  return phone;
}
