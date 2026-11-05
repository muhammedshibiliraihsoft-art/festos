export type DynamicPortal = 'team' | 'stage';

const cleanLabel = (value: string | null, fallback: string) => {
  const cleaned = (value || fallback).replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return Array.from(cleaned || fallback).slice(0, 80).join('');
};

export function createPortalManifest(url: URL, portalValue: string | null) {
  if (portalValue !== 'team' && portalValue !== 'stage') return null;

  const portal: DynamicPortal = portalValue;
  const name = 'Festos';
  const identity = cleanLabel(url.searchParams.get('identity'), portal);
  const appId = `/${portal}/${encodeURIComponent(identity)}`;
  const startPath = portal === 'team'
    ? '/team/login?installedPortal=team-leader'
    : `/stage-management/venue/${encodeURIComponent(identity)}`;
  const icon = (path: string) => new URL(path, url.origin).toString();

  return {
    id: appId,
    name,
    short_name: 'Festos',
    start_url: new URL(startPath, url.origin).toString(),
    scope: `${url.origin}${portal === 'team' ? '/team/' : '/stage-management/'}`,
    display: 'standalone',
    ...(portal === 'team' ? { display_override: ['fullscreen', 'standalone'], orientation: 'any' } : {}),
    background_color: portal === 'team' ? '#1D1B19' : '#ffffff',
    theme_color: portal === 'team' ? '#1D1B19' : '#ffffff',
    icons: [
      { src: icon('/brand/consolium-icon-192.png'), sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: icon('/brand/consolium-icon-512.png'), sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: icon('/brand/consolium-maskable-512.png'), sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
