import { Platform } from 'react-native';

export type PortalPwa = 'admin' | 'team-management' | 'team' | 'stage';

const PORTAL_METADATA: Record<PortalPwa, { manifest: string }> = {
  admin: { manifest: '/manifest.json' },
  'team-management': { manifest: '/team-management-manifest.json' },
  team: { manifest: '/team-manifest.json' },
  stage: { manifest: '/manifest.json' },
};

export function applyPortalPwaMetadata(portal: PortalPwa, _displayName?: string | null, identityId?: string | null) {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return () => {};

  const metadata = PORTAL_METADATA[portal];
  const manifestUrl = portal !== 'admin' && identityId
    ? `/portal-manifest?${new URLSearchParams({ portal, name: 'Festos', identity: identityId }).toString()}`
    : metadata.manifest;
  document.title = 'Festos';

  const upsertMeta = (name: string, content: string) => {
    let element = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
    if (!element) {
      element = document.createElement('meta');
      element.name = name;
      document.head.appendChild(element);
    }
    element.content = content;
  };

  const upsertLink = (rel: string, href: string, sizes?: string) => {
    const existing = Array.from(document.head.querySelectorAll<HTMLLinkElement>(`link[rel="${rel}"]`));
    const links = existing.length ? existing : [document.head.appendChild(document.createElement('link'))];
    links.forEach((element) => {
      element.rel = rel;
      element.href = href;
      if (sizes) element.sizes = sizes;
      if (rel === 'manifest') element.dataset.portalPwa = portal;
    });
  };

  upsertMeta('apple-mobile-web-app-title', 'Festos');
  upsertMeta('application-name', 'Festos');
  upsertMeta('apple-mobile-web-app-capable', 'yes');
  upsertMeta('apple-mobile-web-app-status-bar-style', 'default');
  upsertMeta('theme-color', portal === 'team' ? '#1D1B19' : '#FFFFFF');
  upsertLink('manifest', manifestUrl);
  upsertLink('apple-touch-icon', '/brand/apple-touch-icon-180.png', '180x180');
  upsertLink('icon', '/brand/favicon.png', '48x48');

  return () => {
    document.title = 'Festos';
    upsertMeta('apple-mobile-web-app-title', 'Festos');
    upsertMeta('application-name', 'Festos');
    upsertLink('manifest', PORTAL_METADATA.admin.manifest);
    document.head.querySelectorAll<HTMLLinkElement>('link[rel="manifest"]').forEach((element) => {
      delete element.dataset.portalPwa;
    });
  };
}
