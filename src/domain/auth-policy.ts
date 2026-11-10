// Registration never asks for email confirmation. Recovery uses a saved,
// single-use code; changing email requires the current password. No mail provider.
export const authFeatures = {
  offlineRecovery: true,
  emailChange: true,
} as const
