import type { UserEnvironment } from './auth'

export function buildSessionEnvironment(environment: UserEnvironment | null | undefined, timezone: string, locale: string) {
  const location = environment?.location
  return {
    timezone: environment?.timezone?.trim() || timezone || '',
    locale: environment?.locale?.trim() || locale || 'zh-CN',
    location: {
      country: location?.country ?? '', region: location?.region ?? '',
      city: location?.city ?? '', district: location?.district ?? '',
      ...(location?.latitude == null ? {} : { latitude: location.latitude }),
      ...(location?.longitude == null ? {} : { longitude: location.longitude }),
    },
  }
}
