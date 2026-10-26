import React, { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import {
  IModuleDefinition,
  IRouteDefinition,
  IModuleEntityDefinition,
} from '../types';
import { AccessDenied } from './AccessDenied';

const CORE_MODULE_IDS = new Set([
  'dashboard',
  'auth',
  'sistem-ayarlari',
  'yardim',
  'bildirimler',
  'email-module',
  'EmailModulu',
]);

/**
 * URL rotasını standartlaştırır (query params, hash ve sondaki slash'leri temizler)
 */
export function normalizePath(path?: string): string {
  if (!path) return '';
  const noQuery = path.split('?')[0].split('#')[0];
  const trimmed = noQuery.trim().replace(/\/+$/, '');
  if (!trimmed) return '/';
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

/**
 * Verilen rota yolunun hedef şablonla eşleşip eşleşmediğini kontrol eder.
 */
export function matchRoutePattern(currentPath: string, targetPattern: string): boolean {
  const current = normalizePath(currentPath);
  const target = normalizePath(targetPattern);

  if (!current || !target) return false;

  // 1. Birebir eşitlik
  if (current === target) return true;

  // 2. Parametrik rota eşleşmesi (/cariler/:id -> /cariler/123, /cariler/yeni)
  if (target.includes(':')) {
    const regexPattern =
      '^' + target.replace(/:[a-zA-Z0-9_]+/g, '([^/]+)') + '(/.*)?$';
    try {
      const regex = new RegExp(regexPattern);
      if (regex.test(current)) return true;
    } catch {
      // regex fallback
    }

    // Parametreli rotanın kök yolu (örn: /cariler/:id -> /cariler)
    const baseTarget = target.split('/:')[0];
    if (current === baseTarget || current.startsWith(`${baseTarget}/`)) {
      return true;
    }
  }

  // 3. Alt rota eşleşmesi (örn: target /faturalar/1 -> current /faturalar/1/yeni veya /faturalar/1/123)
  if (current.startsWith(`${target}/`)) {
    return true;
  }

  return false;
}

/**
 * Bir rotanın veya URL yolunun, ilgili modülde tescil edilmiş (whitelist) bir varlığa
 * veya izin verilmiş yardımcı rotaya ait olup olmadığını doğrular.
 */
export function isRouteWhitelisted(
  pathname: string,
  routeDef: IRouteDefinition,
  module: IModuleDefinition
): boolean {
  if (!module) return true;

  // Çekirdek modüller için whitelist kontrolü muaf tutulur
  if (module.isCore || CORE_MODULE_IDS.has(module.id)) {
    return true;
  }

  const hasRegisteredEntities =
    (Array.isArray(module.lists) && module.lists.length > 0) ||
    (Array.isArray(module.cards) && module.cards.length > 0) ||
    (Array.isArray(module.documents) && module.documents.length > 0) ||
    (Array.isArray(module.reports) && module.reports.length > 0) ||
    (Array.isArray(module.operations) && module.operations.length > 0);

  // Eğer modülde hiçbir kart/belge yoksa ve strictEntityRegistration açık değilse serbest bırak
  if (!module.strictEntityRegistration && !hasRegisteredEntities) {
    return true;
  }

  // Açıkça izin verilen yardımcı rotalar (whitelistedRoutes) kontrolü
  if (Array.isArray(module.whitelistedRoutes) && module.whitelistedRoutes.length > 0) {
    for (const wPath of module.whitelistedRoutes) {
      if (
        (pathname && matchRoutePattern(pathname, wPath)) ||
        (routeDef.path && matchRoutePattern(routeDef.path, wPath))
      ) {
        return true;
      }
    }
  }

  // Modüle ait tescilli liste, kart, belge, rapor ve işlem tanımlarını topla
  const entities: IModuleEntityDefinition[] = [
    ...(module.lists || []),
    ...(module.cards || []),
    ...(module.documents || []),
    ...(module.reports || []),
    ...(module.operations || []),
  ];

  // Sadece tescili iptal edilmemiş (isRegistered !== false) varlıkları dikkate al
  const validEntities = entities.filter((e) => e.isRegistered !== false);

  for (const entity of validEntities) {
    const candidateRoutes = [entity.route, entity.listRoute, entity.formRoute].filter(
      Boolean
    ) as string[];

    for (const cRoute of candidateRoutes) {
      if (
        (pathname && matchRoutePattern(pathname, cRoute)) ||
        (routeDef.path && matchRoutePattern(routeDef.path, cRoute))
      ) {
        return true;
      }
    }
  }

  return false;
}

export interface RouteWhitelistGuardProps {
  module: IModuleDefinition;
  route: IRouteDefinition;
  children: ReactNode;
}

/**
 * Strict Whitelist Motoru - Rota Erişim Koruyucusu (RouteWhitelistGuard)
 * Register kaydı (entities.ts) bulunmayan hiçbir listenin, belgenin veya kartın
 * doğrudan URL girilerek veya linke tıklanarak açılmasına izin vermez.
 */
export const RouteWhitelistGuard: React.FC<RouteWhitelistGuardProps> = ({
  module,
  route,
  children,
}) => {
  let currentPathname = '';
  try {
    const location = useLocation();
    currentPathname = location?.pathname || '';
  } catch {
    if (typeof window !== 'undefined' && window.location) {
      currentPathname = window.location.pathname;
    }
  }

  const isAllowed = isRouteWhitelisted(currentPathname, route, module);

  if (!isAllowed) {
    const blockedPath = currentPathname || route.path;
    console.warn(
      `[ModuleRegistry - Strict Whitelist Engine] Erişim engellendi: "${blockedPath}" (Modül: "${module.id}"). Bu liste, kart veya belge entities.ts kütüğünde tescil edilmemiştir.`
    );

    return (
      <AccessDenied
        title="Kayıtsız Liste, Belge veya Kart"
        description={`Bu sayfa (${blockedPath}) modül tescil kütüğünde (entities.ts) kayıtlı değildir ve Strict Whitelist motoru tarafından erişime kapatılmıştır.`}
      />
    );
  }

  return <>{children}</>;
};

export default RouteWhitelistGuard;
