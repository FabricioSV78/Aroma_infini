export function isUploadedImage(image: string) {
  return image.startsWith('data:image/webp;base64,')
}

export function imageSource(image: string, width = 480) {
  return isUploadedImage(image) ? image : `/images/${image}-${width}.webp`
}

export function imageSourceSet(image: string, widths: readonly number[]) {
  return isUploadedImage(image)
    ? undefined
    : widths.map((width) => `${imageSource(image, width)} ${width}w`).join(', ')
}
