import { Link } from 'react-router'
import { Icon } from '../../components/ui/Icon'
import { aboutPageContent as content } from '../../content/institutional'
import { InstitutionalBreadcrumb } from './InstitutionalBreadcrumb'
import { assetSource, assetSourceSet } from '../../services/asset-source'

export function AboutPage() {
  return (
    <article className="store-page institutional-page institutional-about">
      <div className="container">
        <InstitutionalBreadcrumb current="Nosotros" />

        <section className="about-hero" aria-labelledby="about-title">
          <header className="about-hero-copy">
            <p className="eyebrow">{content.hero.eyebrow}</p>
            <h1 id="about-title">{content.hero.title}</h1>
            <p className="about-hero-intro">{content.hero.introduction}</p>
          </header>
          <picture className="about-hero-media">
            <source
              media="(max-width: 767px)"
              srcSet={assetSourceSet(content.hero.image.mobileSet)}
              sizes="(max-width: 767px) calc(100vw - 32px), 100vw"
            />
            <img
              src={assetSource(content.hero.image.desktop)}
              srcSet={assetSourceSet(content.hero.image.desktopSet)}
              sizes="(max-width: 767px) calc(100vw - 32px), (max-width: 1680px) calc(100vw - 80px), 1680px"
              width={1536}
              height={864}
              alt={content.hero.image.alt}
              decoding="async"
              fetchPriority="high"
            />
          </picture>
        </section>
      </div>

      <section className="container about-story" aria-labelledby="about-story-title">
        <figure className="about-story-media" data-scroll-reveal="image">
          <img
            src={assetSource(content.story.image.src)}
            width={960}
            height={1200}
            alt={content.story.image.alt}
            loading="lazy"
            decoding="async"
          />
        </figure>
        <div className="about-story-copy" data-scroll-reveal="copy">
          <p className="eyebrow">{content.story.eyebrow}</p>
          <h2 id="about-story-title">{content.story.title}</h2>
          {content.story.paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
      </section>

      <section className="container about-proposal" aria-labelledby="about-proposal-title">
        <div className="about-proposal-heading" data-scroll-reveal="copy">
          <p className="eyebrow">{content.proposal.eyebrow}</p>
          <h2 id="about-proposal-title">{content.proposal.title}</h2>
        </div>
        <div className="about-proposal-detail" data-scroll-reveal="copy">
          <p>{content.proposal.description}</p>
          <div className="about-proposal-actions">
            <Link className="button button--primary" to="/tienda">
              {content.proposal.primaryAction} <Icon name="arrow" />
            </Link>
            <Link className="text-link" to="/marcas">
              {content.proposal.secondaryAction} <Icon name="arrow" />
            </Link>
          </div>
        </div>
      </section>
    </article>
  )
}
