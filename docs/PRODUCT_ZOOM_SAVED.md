# Acercamiento reservado para una iteración futura

El cliente pidió conservar este efecto para más adelante y sustituirlo ahora por un fundido entre fotografías en Más vendidos. Este fragmento está archivado; no se importa ni activa en la aplicación.

```css
.future-product-zoom img {
  transform: scale(1);
  transform-origin: center 55%;
  transition: transform 650ms cubic-bezier(0.22, 1, 0.36, 1);
}
.future-product-zoom:focus-visible img {
  transform: scale(1.18);
}
@media (hover: hover) and (pointer: fine) {
  .future-product-zoom:hover img {
    transform: scale(1.18);
  }
}
@media (prefers-reduced-motion: reduce) {
  .future-product-zoom img {
    transition: none;
  }
}
```

El contenedor debe conservar dimensiones fijas y recortar el acercamiento con `overflow: hidden`, manteniendo visible el foco exterior del enlace.
