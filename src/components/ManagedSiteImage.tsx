import type { ComponentPropsWithoutRef } from 'react'
import type { SiteMediaSlot } from '../domain/site-media-slots'
import { siteMediaImage, useSiteMedia } from '../services/site-media-service'
import { LoadingImage } from './media/LoadingImage'

interface ManagedSiteImageProps extends Omit<
  ComponentPropsWithoutRef<'img'>,
  'src' | 'srcSet'
> {
  slot: SiteMediaSlot
}

export function ManagedSiteImage({
  slot,
  alt,
  ...props
}: ManagedSiteImageProps) {
  const image = siteMediaImage(useSiteMedia(), slot)
  return <LoadingImage {...image} {...props} alt={alt ?? image.alt} />
}

interface ManagedSiteSourceProps extends Omit<
  ComponentPropsWithoutRef<'source'>,
  'src' | 'srcSet'
> {
  slot: SiteMediaSlot
}

export function ManagedSiteSource({ slot, ...props }: ManagedSiteSourceProps) {
  const image = siteMediaImage(useSiteMedia(), slot)
  return <source {...props} srcSet={image.srcSet ?? image.src} />
}
