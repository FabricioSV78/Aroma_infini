import type { IconName } from '../components/ui/Icon'

export interface SocialProfile {
  label: string
  icon: IconName
  url: string | null
}

// Replace null with the brand's verified profile URL before publishing the link.
export const footerSocialProfiles: SocialProfile[] = [
  { label: 'Instagram', icon: 'instagram', url: null },
  { label: 'Facebook', icon: 'facebook', url: null },
  { label: 'TikTok', icon: 'tiktok', url: null },
]
