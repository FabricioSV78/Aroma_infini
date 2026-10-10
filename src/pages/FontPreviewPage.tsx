import { useRef, useState } from 'react'
import { Link } from 'react-router'
import {
  applyFontPreference,
  fontOptions,
  getFontPreference,
  type FontId,
} from '../lib/font-preference'
import './font-preview.css'

export function FontPreviewPage() {
  const [selected, setSelected] = useState(getFontPreference)
  const [status, setStatus] = useState(
    'Elige una fuente para verla en toda la web.',
  )
  const request = useRef(0)

  async function selectFont(id: FontId) {
    const sequence = ++request.current
    const font = fontOptions.find((option) => option.id === id)!
    const previousSelection = selected
    setSelected(id)
    setStatus(`Cargando ${font.name}…`)
    try {
      await document.fonts.load(`400 16px "${font.name}"`)
      if (sequence !== request.current) return
      const saved = applyFontPreference(id)
      setStatus(
        `${font.name} aplicada.${saved ? ' Selección guardada en este navegador.' : ' No se pudo guardar; se mantendrá mientras navegues sin recargar.'}`,
      )
    } catch {
      if (sequence === request.current) {
        setSelected(previousSelection)
        setStatus('No se pudo cargar la fuente. Inténtalo de nuevo.')
      }
    }
  }

  return (
    <div className="container font-preview">
      <nav aria-label="Migajas de pan" className="font-preview__breadcrumb">
        <Link to="/">Inicio</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">Tipografía</span>
      </nav>
      <header className="font-preview__header">
        <h1>Encuentra la voz de Aroma Infini.</h1>
        <p>
          Compara seis fuentes con los mismos tamaños y espaciados. Tu elección
          se aplica a la tienda y al panel, solo en este navegador.
        </p>
      </header>
      <fieldset className="font-preview__choices">
        <legend>Selecciona una tipografía</legend>
        <div className="font-preview__grid">
          {fontOptions.map((font) => (
            <label
              key={font.id}
              className="font-preview__option"
              style={{ fontFamily: `"${font.name}", Arial, sans-serif` }}
            >
              <span className="font-preview__option-top">
                <span>{font.note}</span>
                <input
                  type="radio"
                  name="font"
                  value={font.id}
                  checked={selected === font.id}
                  onChange={() => void selectFont(font.id)}
                  aria-label={font.name}
                />
              </span>
              <strong>{font.name}</strong>
              <span>{font.description}</span>
              <span className="font-preview__sample">
                Perfumería de autor
                <br />
                Ámbar, sándalo y cedro · S/ 390
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="font-preview__actions">
        <p role="status">{status}</p>
        <button type="button" onClick={() => void selectFont('lato')}>
          Restaurar fuente de marca
        </button>
      </div>
      <section
        className="font-preview__specimen"
        aria-labelledby="font-specimen-title"
      >
        <div>
          <span className="font-preview__eyebrow">Vista previa</span>
          <h2 id="font-specimen-title">Un aroma que habla de ti.</h2>
          <p>
            Notas suaves, maderas cálidas y una frescura que acompaña. Descubre
            una selección de perfumes con carácter propio.
          </p>
        </div>
        <div className="font-preview__details">
          <span>Eau de parfum · 50 ml</span>
          <strong>S/ 390</strong>
          <Link className="font-preview__primary" to="/tienda">
            Explorar la tienda
          </Link>
        </div>
      </section>
      <nav
        className="font-preview__links"
        aria-label="Comparar en otras páginas"
      >
        <span>Compruébala en contexto</span>
        <Link to="/">Inicio</Link>
        <Link to="/marcas">Marcas</Link>
        <Link to="/contacto">Contacto</Link>
        <Link to="/admin">Panel administrativo</Link>
      </nav>
      <p className="font-preview__footnote">
        Vuelve a /fuente para cambiar tu elección. No modifica la fuente de
        otros visitantes.
      </p>
    </div>
  )
}
