import { Link } from 'react-router'
import { Icon } from '../../components/ui/Icon'
import { aboutPageContent as content } from '../../content/institutional'
import { InstitutionalBreadcrumb } from './InstitutionalBreadcrumb'

export function AboutPage() {
  return (
    <article className="store-page institutional-page institutional-about">
      <div className="container">
        <InstitutionalBreadcrumb current="Nosotros" />
        <div className="institutional-about-hero">
          <header
            className="institutional-about-opening"
            data-scroll-reveal="copy"
          >
            <h1>{content.title}</h1>
            <p>{content.introduction}</p>
          </header>
          <figure
            className="institutional-about-visual"
            data-scroll-reveal="image"
          >
            <picture>
              <source
                media="(max-width: 767px)"
                srcSet={content.image.mobileSet}
                sizes="(max-width: 767px) calc(100vw - 32px), 50vw"
              />
              <img
                src={content.image.desktop}
                srcSet={content.image.desktopSet}
                sizes="(max-width: 767px) calc(100vw - 32px), 50vw"
                width={1536}
                height={864}
                alt={content.image.alt}
                decoding="async"
                fetchPriority="high"
              />
            </picture>
            <figcaption>{content.image.caption}</figcaption>
          </figure>
        </div>
      </div>

      <section
        className="container institutional-about-approach"
        aria-labelledby="about-approach-title"
      >
        <div
          className="institutional-about-approach-copy"
          data-scroll-reveal="copy"
        >
          <p className="eyebrow">{content.approach.eyebrow}</p>
          <h2 id="about-approach-title">{content.approach.title}</h2>
          <p>{content.approach.description}</p>
          <Link className="text-link" to="/tienda">
            {content.action} <Icon name="arrow" />
          </Link>
        </div>
        <ol
          className="institutional-about-principles"
          data-scroll-reveal="stagger"
        >
          {content.principles.map((principle) => (
            <li key={principle.number}>
              <span aria-hidden="true">{principle.number}</span>
              <div>
                <h3>{principle.title}</h3>
                <p>{principle.description}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </article>
  )
}
