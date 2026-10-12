// Editorial initials for this presentation; these are not official brand logos.
const letterforms: Record<string, { outline: string; detail?: string }> = {
  A: {
    outline: 'M14 68 40 12 66 68M23 48h34',
    detail: 'M14 68h12M54 68h12M46 25l17 37',
  },
  F: {
    outline: 'M24 68V14h42M24 40h32',
    detail: 'M17 68h16M30 20h28M30 46v16',
  },
  SS: {
    outline:
      'M43 21c-4-7-19-8-24 1-8 15 27 18 20 34-5 11-22 10-27 2M66 21c-4-7-19-8-24 1-8 15 27 18 20 34-5 11-22 10-27 2',
  },
  M: {
    outline: 'M13 68V14l27 37 27-37v54',
    detail: 'M20 62V29l20 27 20-27v33',
  },
}

export function BrandMonogram({ name }: { name: string }) {
  const initials = (name.match(/\p{L}[\p{L}\p{M}]*/gu) ?? [])
    .slice(0, 2)
    .map((word) => Array.from(word)[0])
    .join('')
    .toLocaleUpperCase('es')
  const letterform = letterforms[initials]

  return (
    <span className="brand-signature-monogram" aria-hidden="true">
      {letterform ? (
        <svg viewBox="0 0 80 80" fill="none" focusable="false">
          <path d={letterform.outline} />
          {letterform.detail ? (
            <path d={letterform.detail} className="brand-monogram-detail" />
          ) : null}
        </svg>
      ) : (
        initials
      )}
    </span>
  )
}
