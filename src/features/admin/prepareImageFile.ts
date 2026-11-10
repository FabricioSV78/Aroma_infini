// Compatibility entry point for the existing Home editors. Preparation lives
// with media services so other services never depend on admin UI modules.
export {
  prepareImageFile,
  homeImagePresets,
  productImagePreset,
  type ImagePreset,
} from '../../services/prepare-image-file'
