/**
 * WorkBuddy 云服务公开配置 —— 由 cloud-service 生命周期返回的 publicConfig。
 * publishableKey 仅用于标识应用，不含权限；敏感凭证均在服务端。
 */
export const publicConfig = {
  endpoint: 'https://photo-3d-card.app.workbuddy.host',
  oauthRelayBaseUrl: 'https://www.workbuddy.cn/v2/as/genie-baas/oauth',
  publishableKey: 'wbpk_vnP0cR7lWB9G4EU7DSrtjD_fPlTDU4fMD0j4ZIeIGcOwsISrMgD3g43',
} as const
