export const WEB_LAB_AUDIO_POLICY = {
  profile: "web-lab-guide",
  maxBytes: 100 * 1024 * 1024,
  maxDurationSeconds: 10 * 60,
} as const;

// Draft defaults for the future downloadable free edition. The rewarded-ad
// provider and entitlement storage belong to that desktop app, not GitHub Pages.
export const FREE_DESKTOP_AUDIO_POLICY = {
  profile: "desktop-free",
  initialSeconds: 60,
  rewardedExtensionSeconds: 30,
} as const;
