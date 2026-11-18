-- Retire reviewed provisional sources only after their final effective use ends.
-- File bytes remain in private R2. No object is deleted by this migration.
alter table app.media_builtin_aliases add column classification text not null default 'unknown'
  check(classification in('unknown','managed-default','catalog-reference','legacy-unused'));
create table app.media_builtin_bindings (
  path text not null references app.media_builtin_aliases(path) on delete restrict,
  key text not null check(char_length(key) between 1 and 200),
  kind text not null check(kind in('home','site')),
  metadata jsonb not null check(jsonb_typeof(metadata)='object'),
  primary key(path,key)
);
alter table app.media_builtin_bindings enable row level security;
alter table app.media_builtin_bindings force row level security;
revoke all on app.media_builtin_bindings from public,anon,authenticated,service_role;
grant select on app.media_builtin_bindings to aro_media_executor;
create policy media_builtin_bindings_executor on app.media_builtin_bindings for select to aro_media_executor using(true);

-- Seeded from the same closed, versioned resource inventory as the frontend.
do $seed$ declare inventory jsonb:=$inventory$[
  {
    "path": "/brand/logo-on-light.svg",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "site",
        "key": "identity.logo",
        "metadata": {
          "owner": "site",
          "slot": "identity.logo"
        }
      }
    ]
  },
  {
    "path": "/images/account-selection-v1-portrait-1024.webp",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "site",
        "key": "auth.customer.desktop",
        "metadata": {
          "owner": "site",
          "slot": "auth.customer.desktop"
        }
      }
    ]
  },
  {
    "path": "/images/account-selection-v1-portrait-480.webp",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "site",
        "key": "auth.customer.desktop",
        "metadata": {
          "owner": "site",
          "slot": "auth.customer.desktop"
        }
      }
    ]
  },
  {
    "path": "/images/account-selection-v1-portrait-780.webp",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "site",
        "key": "auth.customer.desktop",
        "metadata": {
          "owner": "site",
          "slot": "auth.customer.desktop"
        }
      }
    ]
  },
  {
    "path": "/images/account-selection-v1-wide-1536.webp",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "site",
        "key": "auth.customer.mobile",
        "metadata": {
          "owner": "site",
          "slot": "auth.customer.mobile"
        }
      }
    ]
  },
  {
    "path": "/images/account-selection-v1-wide-960.webp",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "site",
        "key": "auth.customer.mobile",
        "metadata": {
          "owner": "site",
          "slot": "auth.customer.mobile"
        }
      }
    ]
  },
  {
    "path": "/images/ambre-480.webp",
    "classification": "catalog-reference",
    "uses": []
  },
  {
    "path": "/images/ambre-960.webp",
    "classification": "catalog-reference",
    "uses": []
  },
  {
    "path": "/images/ambre-alternate-480.webp",
    "classification": "catalog-reference",
    "uses": []
  },
  {
    "path": "/images/ambre-alternate-960.webp",
    "classification": "catalog-reference",
    "uses": []
  },
  {
    "path": "/images/ambre-back-480.webp",
    "classification": "catalog-reference",
    "uses": []
  },
  {
    "path": "/images/ambre-back-960.webp",
    "classification": "catalog-reference",
    "uses": []
  },
  {
    "path": "/images/ambre-detail-480.webp",
    "classification": "catalog-reference",
    "uses": []
  },
  {
    "path": "/images/ambre-detail-960.webp",
    "classification": "catalog-reference",
    "uses": []
  },
  {
    "path": "/images/cedre-480.webp",
    "classification": "catalog-reference",
    "uses": []
  },
  {
    "path": "/images/cedre-960.webp",
    "classification": "catalog-reference",
    "uses": []
  },
  {
    "path": "/images/cedre-alternate-480.webp",
    "classification": "catalog-reference",
    "uses": []
  },
  {
    "path": "/images/cedre-alternate-960.webp",
    "classification": "catalog-reference",
    "uses": []
  },
  {
    "path": "/images/cedre-back-480.webp",
    "classification": "catalog-reference",
    "uses": []
  },
  {
    "path": "/images/cedre-back-960.webp",
    "classification": "catalog-reference",
    "uses": []
  },
  {
    "path": "/images/cedre-detail-480.webp",
    "classification": "catalog-reference",
    "uses": []
  },
  {
    "path": "/images/cedre-detail-960.webp",
    "classification": "catalog-reference",
    "uses": []
  },
  {
    "path": "/images/discovery-bois-1536.webp",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "home",
        "key": "category.hombre",
        "metadata": {
          "owner": "category",
          "category": "hombre",
          "layout": 3
        }
      },
      {
        "kind": "site",
        "key": "seo.brands",
        "metadata": {
          "owner": "site",
          "slot": "seo.brands"
        }
      }
    ]
  },
  {
    "path": "/images/discovery-bois-480.webp",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "home",
        "key": "category.hombre",
        "metadata": {
          "owner": "category",
          "category": "hombre",
          "layout": 3
        }
      }
    ]
  },
  {
    "path": "/images/discovery-bois-960.webp",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "home",
        "key": "category.hombre",
        "metadata": {
          "owner": "category",
          "category": "hombre",
          "layout": 3
        }
      }
    ]
  },
  {
    "path": "/images/discovery-bois-category-1024.webp",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "home",
        "key": "category.hombre",
        "metadata": {
          "owner": "category",
          "category": "hombre",
          "layout": 4
        }
      }
    ]
  },
  {
    "path": "/images/discovery-bois-category-320.webp",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "home",
        "key": "category.hombre",
        "metadata": {
          "owner": "category",
          "category": "hombre",
          "layout": 4
        }
      }
    ]
  },
  {
    "path": "/images/discovery-bois-category-480.webp",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "home",
        "key": "category.hombre",
        "metadata": {
          "owner": "category",
          "category": "hombre",
          "layout": 4
        }
      }
    ]
  },
  {
    "path": "/images/discovery-bois-category-640.webp",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "home",
        "key": "category.hombre",
        "metadata": {
          "owner": "category",
          "category": "hombre",
          "layout": 4
        }
      }
    ]
  },
  {
    "path": "/images/discovery-bois-category-800.webp",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "home",
        "key": "category.hombre",
        "metadata": {
          "owner": "category",
          "category": "hombre",
          "layout": 4
        }
      }
    ]
  },
  {
    "path": "/images/discovery-bois-category-960.webp",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "home",
        "key": "category.hombre",
        "metadata": {
          "owner": "category",
          "category": "hombre",
          "layout": 4
        }
      }
    ]
  },
  {
    "path": "/images/discovery-complements-v1-1122.webp",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "home",
        "key": "category.complementos",
        "metadata": {
          "owner": "category",
          "category": "complementos",
          "layout": 3
        }
      }
    ]
  },
  {
    "path": "/images/discovery-complements-v1-480.webp",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "home",
        "key": "category.complementos",
        "metadata": {
          "owner": "category",
          "category": "complementos",
          "layout": 3
        }
      }
    ]
  },
  {
    "path": "/images/discovery-complements-v1-960.webp",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "home",
        "key": "category.complementos",
        "metadata": {
          "owner": "category",
          "category": "complementos",
          "layout": 3
        }
      }
    ]
  },
  {
    "path": "/images/discovery-complements-v1-category-1120.webp",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "home",
        "key": "category.complementos",
        "metadata": {
          "owner": "category",
          "category": "complementos",
          "layout": 4
        }
      }
    ]
  },
  {
    "path": "/images/discovery-complements-v1-category-320.webp",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "home",
        "key": "category.complementos",
        "metadata": {
          "owner": "category",
          "category": "complementos",
          "layout": 4
        }
      }
    ]
  },
  {
    "path": "/images/discovery-complements-v1-category-480.webp",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "home",
        "key": "category.complementos",
        "metadata": {
          "owner": "category",
          "category": "complementos",
          "layout": 4
        }
      }
    ]
  },
  {
    "path": "/images/discovery-complements-v1-category-640.webp",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "home",
        "key": "category.complementos",
        "metadata": {
          "owner": "category",
          "category": "complementos",
          "layout": 4
        }
      }
    ]
  },
  {
    "path": "/images/discovery-complements-v1-category-800.webp",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "home",
        "key": "category.complementos",
        "metadata": {
          "owner": "category",
          "category": "complementos",
          "layout": 4
        }
      }
    ]
  },
  {
    "path": "/images/discovery-complements-v1-category-960.webp",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "home",
        "key": "category.complementos",
        "metadata": {
          "owner": "category",
          "category": "complementos",
          "layout": 4
        }
      }
    ]
  },
  {
    "path": "/images/discovery-libre-1536.webp",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "home",
        "key": "category.unisex",
        "metadata": {
          "owner": "category",
          "category": "unisex",
          "layout": 3
        }
      }
    ]
  },
  {
    "path": "/images/discovery-libre-480.webp",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "home",
        "key": "category.unisex",
        "metadata": {
          "owner": "category",
          "category": "unisex",
          "layout": 3
        }
      }
    ]
  },
  {
    "path": "/images/discovery-libre-960.webp",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "home",
        "key": "category.unisex",
        "metadata": {
          "owner": "category",
          "category": "unisex",
          "layout": 3
        }
      }
    ]
  },
  {
    "path": "/images/discovery-libre-category-320.webp",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "home",
        "key": "category.unisex",
        "metadata": {
          "owner": "category",
          "category": "unisex",
          "layout": 4
        }
      }
    ]
  },
  {
    "path": "/images/discovery-libre-category-480.webp",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "home",
        "key": "category.unisex",
        "metadata": {
          "owner": "category",
          "category": "unisex",
          "layout": 4
        }
      }
    ]
  },
  {
    "path": "/images/discovery-libre-category-640.webp",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "home",
        "key": "category.unisex",
        "metadata": {
          "owner": "category",
          "category": "unisex",
          "layout": 4
        }
      }
    ]
  },
  {
    "path": "/images/discovery-libre-category-800.webp",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "home",
        "key": "category.unisex",
        "metadata": {
          "owner": "category",
          "category": "unisex",
          "layout": 4
        }
      }
    ]
  },
  {
    "path": "/images/discovery-libre-category-816.webp",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "home",
        "key": "category.unisex",
        "metadata": {
          "owner": "category",
          "category": "unisex",
          "layout": 4
        }
      }
    ]
  },
  {
    "path": "/images/discovery-petale-1536.webp",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "home",
        "key": "category.mujer",
        "metadata": {
          "owner": "category",
          "category": "mujer",
          "layout": 3
        }
      }
    ]
  },
  {
    "path": "/images/discovery-petale-480.webp",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "home",
        "key": "category.mujer",
        "metadata": {
          "owner": "category",
          "category": "mujer",
          "layout": 3
        }
      }
    ]
  },
  {
    "path": "/images/discovery-petale-960.webp",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "home",
        "key": "category.mujer",
        "metadata": {
          "owner": "category",
          "category": "mujer",
          "layout": 3
        }
      }
    ]
  },
  {
    "path": "/images/discovery-petale-category-320.webp",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "home",
        "key": "category.mujer",
        "metadata": {
          "owner": "category",
          "category": "mujer",
          "layout": 4
        }
      }
    ]
  },
  {
    "path": "/images/discovery-petale-category-480.webp",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "home",
        "key": "category.mujer",
        "metadata": {
          "owner": "category",
          "category": "mujer",
          "layout": 4
        }
      }
    ]
  },
  {
    "path": "/images/discovery-petale-category-640.webp",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "home",
        "key": "category.mujer",
        "metadata": {
          "owner": "category",
          "category": "mujer",
          "layout": 4
        }
      }
    ]
  },
  {
    "path": "/images/discovery-petale-category-800.webp",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "home",
        "key": "category.mujer",
        "metadata": {
          "owner": "category",
          "category": "mujer",
          "layout": 4
        }
      }
    ]
  },
  {
    "path": "/images/discovery-petale-category-816.webp",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "home",
        "key": "category.mujer",
        "metadata": {
          "owner": "category",
          "category": "mujer",
          "layout": 4
        }
      }
    ]
  },
  {
    "path": "/images/editorial-essential-v3-1536.webp",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "site",
        "key": "about.hero.desktop",
        "metadata": {
          "owner": "site",
          "slot": "about.hero.desktop"
        }
      }
    ]
  },
  {
    "path": "/images/editorial-essential-v3-480.webp",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "site",
        "key": "about.hero.desktop",
        "metadata": {
          "owner": "site",
          "slot": "about.hero.desktop"
        }
      }
    ]
  },
  {
    "path": "/images/editorial-essential-v3-960.webp",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "site",
        "key": "about.hero.desktop",
        "metadata": {
          "owner": "site",
          "slot": "about.hero.desktop"
        }
      }
    ]
  },
  {
    "path": "/images/editorial-essential-v3-mobile-480.webp",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "site",
        "key": "about.hero.mobile",
        "metadata": {
          "owner": "site",
          "slot": "about.hero.mobile"
        }
      }
    ]
  },
  {
    "path": "/images/editorial-essential-v3-mobile-780.webp",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "site",
        "key": "about.hero.mobile",
        "metadata": {
          "owner": "site",
          "slot": "about.hero.mobile"
        }
      }
    ]
  },
  {
    "path": "/images/featured-duo-v3-1536.webp",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "site",
        "key": "seo.catalog",
        "metadata": {
          "owner": "site",
          "slot": "seo.catalog"
        }
      }
    ]
  },
  {
    "path": "/images/figue-480.webp",
    "classification": "catalog-reference",
    "uses": []
  },
  {
    "path": "/images/figue-960.webp",
    "classification": "catalog-reference",
    "uses": []
  },
  {
    "path": "/images/figue-alternate-480.webp",
    "classification": "catalog-reference",
    "uses": []
  },
  {
    "path": "/images/figue-alternate-960.webp",
    "classification": "catalog-reference",
    "uses": []
  },
  {
    "path": "/images/figue-back-480.webp",
    "classification": "catalog-reference",
    "uses": []
  },
  {
    "path": "/images/figue-back-960.webp",
    "classification": "catalog-reference",
    "uses": []
  },
  {
    "path": "/images/figue-detail-480.webp",
    "classification": "catalog-reference",
    "uses": []
  },
  {
    "path": "/images/figue-detail-960.webp",
    "classification": "catalog-reference",
    "uses": []
  },
  {
    "path": "/images/hero-v2-lumiere-desktop-1536.webp",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "home",
        "key": "hero.default.0.desktop",
        "metadata": {
          "owner": "hero",
          "fallbackIndex": 0,
          "orientation": "desktop"
        }
      },
      {
        "kind": "site",
        "key": "seo.home",
        "metadata": {
          "owner": "site",
          "slot": "seo.home"
        }
      }
    ]
  },
  {
    "path": "/images/hero-v2-lumiere-desktop-2048.webp",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "home",
        "key": "hero.default.0.desktop",
        "metadata": {
          "owner": "hero",
          "fallbackIndex": 0,
          "orientation": "desktop"
        }
      }
    ]
  },
  {
    "path": "/images/hero-v2-lumiere-desktop-960.webp",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "home",
        "key": "hero.default.0.desktop",
        "metadata": {
          "owner": "hero",
          "fallbackIndex": 0,
          "orientation": "desktop"
        }
      }
    ]
  },
  {
    "path": "/images/hero-v2-lumiere-mobile-1024.webp",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "home",
        "key": "hero.default.0.mobile",
        "metadata": {
          "owner": "hero",
          "fallbackIndex": 0,
          "orientation": "mobile"
        }
      }
    ]
  },
  {
    "path": "/images/hero-v2-lumiere-mobile-480.webp",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "home",
        "key": "hero.default.0.mobile",
        "metadata": {
          "owner": "hero",
          "fallbackIndex": 0,
          "orientation": "mobile"
        }
      }
    ]
  },
  {
    "path": "/images/hero-v2-lumiere-mobile-780.webp",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "home",
        "key": "hero.default.0.mobile",
        "metadata": {
          "owner": "hero",
          "fallbackIndex": 0,
          "orientation": "mobile"
        }
      }
    ]
  },
  {
    "path": "/images/hero-v3-petale-desktop-1536.webp",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "home",
        "key": "hero.default.2.desktop",
        "metadata": {
          "owner": "hero",
          "fallbackIndex": 2,
          "orientation": "desktop"
        }
      }
    ]
  },
  {
    "path": "/images/hero-v3-petale-desktop-2048.webp",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "home",
        "key": "hero.default.2.desktop",
        "metadata": {
          "owner": "hero",
          "fallbackIndex": 2,
          "orientation": "desktop"
        }
      }
    ]
  },
  {
    "path": "/images/hero-v3-petale-desktop-960.webp",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "home",
        "key": "hero.default.2.desktop",
        "metadata": {
          "owner": "hero",
          "fallbackIndex": 2,
          "orientation": "desktop"
        }
      }
    ]
  },
  {
    "path": "/images/hero-v3-petale-mobile-1024.webp",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "home",
        "key": "hero.default.2.mobile",
        "metadata": {
          "owner": "hero",
          "fallbackIndex": 2,
          "orientation": "mobile"
        }
      }
    ]
  },
  {
    "path": "/images/hero-v3-petale-mobile-480.webp",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "home",
        "key": "hero.default.2.mobile",
        "metadata": {
          "owner": "hero",
          "fallbackIndex": 2,
          "orientation": "mobile"
        }
      }
    ]
  },
  {
    "path": "/images/hero-v3-petale-mobile-780.webp",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "home",
        "key": "hero.default.2.mobile",
        "metadata": {
          "owner": "hero",
          "fallbackIndex": 2,
          "orientation": "mobile"
        }
      }
    ]
  },
  {
    "path": "/images/hero-v4-amber-desktop-1536.webp",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "home",
        "key": "hero.default.3.desktop",
        "metadata": {
          "owner": "hero",
          "fallbackIndex": 3,
          "orientation": "desktop"
        }
      }
    ]
  },
  {
    "path": "/images/hero-v4-amber-desktop-2048.webp",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "home",
        "key": "hero.default.3.desktop",
        "metadata": {
          "owner": "hero",
          "fallbackIndex": 3,
          "orientation": "desktop"
        }
      }
    ]
  },
  {
    "path": "/images/hero-v4-amber-desktop-960.webp",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "home",
        "key": "hero.default.3.desktop",
        "metadata": {
          "owner": "hero",
          "fallbackIndex": 3,
          "orientation": "desktop"
        }
      }
    ]
  },
  {
    "path": "/images/hero-v4-amber-mobile-1024.webp",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "home",
        "key": "hero.default.3.mobile",
        "metadata": {
          "owner": "hero",
          "fallbackIndex": 3,
          "orientation": "mobile"
        }
      }
    ]
  },
  {
    "path": "/images/hero-v4-amber-mobile-480.webp",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "home",
        "key": "hero.default.3.mobile",
        "metadata": {
          "owner": "hero",
          "fallbackIndex": 3,
          "orientation": "mobile"
        }
      }
    ]
  },
  {
    "path": "/images/hero-v4-amber-mobile-780.webp",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "home",
        "key": "hero.default.3.mobile",
        "metadata": {
          "owner": "hero",
          "fallbackIndex": 3,
          "orientation": "mobile"
        }
      }
    ]
  },
  {
    "path": "/images/hero-v4-citrus-desktop-1536.webp",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "home",
        "key": "hero.default.4.desktop",
        "metadata": {
          "owner": "hero",
          "fallbackIndex": 4,
          "orientation": "desktop"
        }
      }
    ]
  },
  {
    "path": "/images/hero-v4-citrus-desktop-2048.webp",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "home",
        "key": "hero.default.4.desktop",
        "metadata": {
          "owner": "hero",
          "fallbackIndex": 4,
          "orientation": "desktop"
        }
      }
    ]
  },
  {
    "path": "/images/hero-v4-citrus-desktop-960.webp",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "home",
        "key": "hero.default.4.desktop",
        "metadata": {
          "owner": "hero",
          "fallbackIndex": 4,
          "orientation": "desktop"
        }
      }
    ]
  },
  {
    "path": "/images/hero-v4-citrus-mobile-1024.webp",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "home",
        "key": "hero.default.4.mobile",
        "metadata": {
          "owner": "hero",
          "fallbackIndex": 4,
          "orientation": "mobile"
        }
      }
    ]
  },
  {
    "path": "/images/hero-v4-citrus-mobile-480.webp",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "home",
        "key": "hero.default.4.mobile",
        "metadata": {
          "owner": "hero",
          "fallbackIndex": 4,
          "orientation": "mobile"
        }
      }
    ]
  },
  {
    "path": "/images/hero-v4-citrus-mobile-780.webp",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "home",
        "key": "hero.default.4.mobile",
        "metadata": {
          "owner": "hero",
          "fallbackIndex": 4,
          "orientation": "mobile"
        }
      }
    ]
  },
  {
    "path": "/images/hero-v5-silence-desktop-1536.webp",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "home",
        "key": "hero.default.1.desktop",
        "metadata": {
          "owner": "hero",
          "fallbackIndex": 1,
          "orientation": "desktop"
        }
      }
    ]
  },
  {
    "path": "/images/hero-v5-silence-desktop-2048.webp",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "home",
        "key": "hero.default.1.desktop",
        "metadata": {
          "owner": "hero",
          "fallbackIndex": 1,
          "orientation": "desktop"
        }
      }
    ]
  },
  {
    "path": "/images/hero-v5-silence-desktop-960.webp",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "home",
        "key": "hero.default.1.desktop",
        "metadata": {
          "owner": "hero",
          "fallbackIndex": 1,
          "orientation": "desktop"
        }
      }
    ]
  },
  {
    "path": "/images/hero-v5-silence-mobile-1024.webp",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "home",
        "key": "hero.default.1.mobile",
        "metadata": {
          "owner": "hero",
          "fallbackIndex": 1,
          "orientation": "mobile"
        }
      }
    ]
  },
  {
    "path": "/images/hero-v5-silence-mobile-480.webp",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "home",
        "key": "hero.default.1.mobile",
        "metadata": {
          "owner": "hero",
          "fallbackIndex": 1,
          "orientation": "mobile"
        }
      }
    ]
  },
  {
    "path": "/images/hero-v5-silence-mobile-780.webp",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "home",
        "key": "hero.default.1.mobile",
        "metadata": {
          "owner": "hero",
          "fallbackIndex": 1,
          "orientation": "mobile"
        }
      }
    ]
  },
  {
    "path": "/images/iris-480.webp",
    "classification": "catalog-reference",
    "uses": []
  },
  {
    "path": "/images/iris-960.webp",
    "classification": "catalog-reference",
    "uses": []
  },
  {
    "path": "/images/iris-alternate-480.webp",
    "classification": "catalog-reference",
    "uses": []
  },
  {
    "path": "/images/iris-alternate-960.webp",
    "classification": "catalog-reference",
    "uses": []
  },
  {
    "path": "/images/iris-back-480.webp",
    "classification": "catalog-reference",
    "uses": []
  },
  {
    "path": "/images/iris-back-960.webp",
    "classification": "catalog-reference",
    "uses": []
  },
  {
    "path": "/images/iris-detail-480.webp",
    "classification": "catalog-reference",
    "uses": []
  },
  {
    "path": "/images/iris-detail-960.webp",
    "classification": "catalog-reference",
    "uses": []
  },
  {
    "path": "/images/neroli-480.webp",
    "classification": "catalog-reference",
    "uses": []
  },
  {
    "path": "/images/neroli-960.webp",
    "classification": "catalog-reference",
    "uses": []
  },
  {
    "path": "/images/neroli-alternate-480.webp",
    "classification": "catalog-reference",
    "uses": []
  },
  {
    "path": "/images/neroli-alternate-960.webp",
    "classification": "catalog-reference",
    "uses": []
  },
  {
    "path": "/images/neroli-back-480.webp",
    "classification": "catalog-reference",
    "uses": []
  },
  {
    "path": "/images/neroli-back-960.webp",
    "classification": "catalog-reference",
    "uses": []
  },
  {
    "path": "/images/neroli-detail-480.webp",
    "classification": "catalog-reference",
    "uses": []
  },
  {
    "path": "/images/neroli-detail-960.webp",
    "classification": "catalog-reference",
    "uses": []
  },
  {
    "path": "/images/olfactory-ambre-thumb-160.webp",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "home",
        "key": "finder.family.ambar",
        "metadata": {
          "owner": "finder-family",
          "value": "ambar"
        }
      }
    ]
  },
  {
    "path": "/images/olfactory-ambre-thumb-320.webp",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "home",
        "key": "finder.family.ambar",
        "metadata": {
          "owner": "finder-family",
          "value": "ambar"
        }
      }
    ]
  },
  {
    "path": "/images/olfactory-ambre.webp",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "home",
        "key": "finder.family.ambar",
        "metadata": {
          "owner": "finder-family",
          "value": "ambar"
        }
      }
    ]
  },
  {
    "path": "/images/olfactory-cedre-thumb-160.webp",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "home",
        "key": "finder.family.amaderado",
        "metadata": {
          "owner": "finder-family",
          "value": "amaderado"
        }
      }
    ]
  },
  {
    "path": "/images/olfactory-cedre-thumb-320.webp",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "home",
        "key": "finder.family.amaderado",
        "metadata": {
          "owner": "finder-family",
          "value": "amaderado"
        }
      }
    ]
  },
  {
    "path": "/images/olfactory-cedre.webp",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "home",
        "key": "finder.desktop",
        "metadata": {
          "owner": "finder",
          "field": "desktopImage"
        }
      },
      {
        "kind": "home",
        "key": "finder.family.amaderado",
        "metadata": {
          "owner": "finder-family",
          "value": "amaderado"
        }
      }
    ]
  },
  {
    "path": "/images/olfactory-figue.webp",
    "classification": "catalog-reference",
    "uses": []
  },
  {
    "path": "/images/olfactory-iris.webp",
    "classification": "catalog-reference",
    "uses": []
  },
  {
    "path": "/images/olfactory-neroli-thumb-160.webp",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "home",
        "key": "finder.family.citrico",
        "metadata": {
          "owner": "finder-family",
          "value": "citrico"
        }
      }
    ]
  },
  {
    "path": "/images/olfactory-neroli-thumb-320.webp",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "home",
        "key": "finder.family.citrico",
        "metadata": {
          "owner": "finder-family",
          "value": "citrico"
        }
      }
    ]
  },
  {
    "path": "/images/olfactory-neroli.webp",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "home",
        "key": "finder.family.citrico",
        "metadata": {
          "owner": "finder-family",
          "value": "citrico"
        }
      }
    ]
  },
  {
    "path": "/images/olfactory-petale-thumb-160.webp",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "home",
        "key": "finder.family.floral",
        "metadata": {
          "owner": "finder-family",
          "value": "floral"
        }
      }
    ]
  },
  {
    "path": "/images/olfactory-petale-thumb-320.webp",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "home",
        "key": "finder.family.floral",
        "metadata": {
          "owner": "finder-family",
          "value": "floral"
        }
      }
    ]
  },
  {
    "path": "/images/olfactory-petale.webp",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "home",
        "key": "finder.family.floral",
        "metadata": {
          "owner": "finder-family",
          "value": "floral"
        }
      }
    ]
  },
  {
    "path": "/images/olfactory-santal.webp",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "site",
        "key": "about.story",
        "metadata": {
          "owner": "site",
          "slot": "about.story"
        }
      }
    ]
  },
  {
    "path": "/images/olfactory-sillage-thumb-160.webp",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "home",
        "key": "finder.family.verde",
        "metadata": {
          "owner": "finder-family",
          "value": "verde"
        }
      }
    ]
  },
  {
    "path": "/images/olfactory-sillage-thumb-320.webp",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "home",
        "key": "finder.family.verde",
        "metadata": {
          "owner": "finder-family",
          "value": "verde"
        }
      }
    ]
  },
  {
    "path": "/images/olfactory-sillage.webp",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "home",
        "key": "finder.family.verde",
        "metadata": {
          "owner": "finder-family",
          "value": "verde"
        }
      }
    ]
  },
  {
    "path": "/images/petale-480.webp",
    "classification": "catalog-reference",
    "uses": []
  },
  {
    "path": "/images/petale-960.webp",
    "classification": "catalog-reference",
    "uses": []
  },
  {
    "path": "/images/petale-alternate-480.webp",
    "classification": "catalog-reference",
    "uses": []
  },
  {
    "path": "/images/petale-alternate-960.webp",
    "classification": "catalog-reference",
    "uses": []
  },
  {
    "path": "/images/petale-back-480.webp",
    "classification": "catalog-reference",
    "uses": []
  },
  {
    "path": "/images/petale-back-960.webp",
    "classification": "catalog-reference",
    "uses": []
  },
  {
    "path": "/images/petale-detail-480.webp",
    "classification": "catalog-reference",
    "uses": []
  },
  {
    "path": "/images/petale-detail-960.webp",
    "classification": "catalog-reference",
    "uses": []
  },
  {
    "path": "/images/santal-480.webp",
    "classification": "catalog-reference",
    "uses": []
  },
  {
    "path": "/images/santal-960.webp",
    "classification": "catalog-reference",
    "uses": []
  },
  {
    "path": "/images/santal-alternate-480.webp",
    "classification": "catalog-reference",
    "uses": []
  },
  {
    "path": "/images/santal-alternate-960.webp",
    "classification": "catalog-reference",
    "uses": []
  },
  {
    "path": "/images/santal-back-480.webp",
    "classification": "catalog-reference",
    "uses": []
  },
  {
    "path": "/images/santal-back-960.webp",
    "classification": "catalog-reference",
    "uses": []
  },
  {
    "path": "/images/santal-detail-480.webp",
    "classification": "catalog-reference",
    "uses": []
  },
  {
    "path": "/images/santal-detail-960.webp",
    "classification": "catalog-reference",
    "uses": []
  },
  {
    "path": "/images/sillage-480.webp",
    "classification": "catalog-reference",
    "uses": []
  },
  {
    "path": "/images/sillage-960.webp",
    "classification": "catalog-reference",
    "uses": []
  },
  {
    "path": "/images/sillage-alternate-480.webp",
    "classification": "catalog-reference",
    "uses": []
  },
  {
    "path": "/images/sillage-alternate-960.webp",
    "classification": "catalog-reference",
    "uses": []
  },
  {
    "path": "/images/sillage-back-480.webp",
    "classification": "catalog-reference",
    "uses": []
  },
  {
    "path": "/images/sillage-back-960.webp",
    "classification": "catalog-reference",
    "uses": []
  },
  {
    "path": "/images/sillage-detail-480.webp",
    "classification": "catalog-reference",
    "uses": []
  },
  {
    "path": "/images/sillage-detail-960.webp",
    "classification": "catalog-reference",
    "uses": []
  },
  {
    "path": "/videos/perfume-editorial-mobile.mp4",
    "classification": "legacy-unused",
    "uses": []
  },
  {
    "path": "/videos/perfume-editorial-mobile.webp",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "home",
        "key": "film.mobilePoster",
        "metadata": {
          "owner": "film",
          "role": "mobilePoster"
        }
      }
    ]
  },
  {
    "path": "/videos/perfume-editorial-wide.mp4",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "home",
        "key": "film.video",
        "metadata": {
          "owner": "film",
          "role": "video"
        }
      }
    ]
  },
  {
    "path": "/videos/perfume-editorial-wide.webp",
    "classification": "managed-default",
    "uses": [
      {
        "kind": "home",
        "key": "film.desktopPoster",
        "metadata": {
          "owner": "film",
          "role": "desktopPoster"
        }
      },
      {
        "kind": "home",
        "key": "film.mobilePosterFallback",
        "metadata": {
          "owner": "film",
          "role": "mobilePosterFallback"
        }
      }
    ]
  }
]$inventory$::jsonb;begin
  update app.media_builtin_aliases a set classification=x.value->>'classification' from jsonb_array_elements(inventory) x(value) where a.path=x.value->>'path';
  insert into app.media_builtin_bindings(path,key,kind,metadata) select x.value->>'path',u.value->>'key',u.value->>'kind',u.value->'metadata' from jsonb_array_elements(inventory) x(value) cross join lateral jsonb_array_elements(x.value->'uses') u(value);
  if (select count(*) from app.media_builtin_aliases where classification<>'unknown')<>162 or (select count(*) from app.media_builtin_bindings)<>99 then raise exception 'Reviewed built-in ownership inventory mismatch';end if;
end;$seed$;

create function private.builtin_binding_in_use(p_kind text,p_metadata jsonb)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare doc app.home_document%rowtype;owner text:=p_metadata->>'owner';slide jsonb;film jsonb;visual jsonb;placement_slot text;
begin
  if p_kind='site' and owner='site' then
    placement_slot:=p_metadata->>'slot';
    -- A missing row/document is a bootstrap fallback, not proof of non-use.
    return not exists(select 1 from app.site_media_slots s where s.slot=placement_slot and s.asset_id is not null);
  end if;
  if p_kind is distinct from 'home' then return true;end if;
  select * into doc from app.home_document where singleton;
  if not found then return true;end if;
  if owner='category' then return doc.media->(p_metadata->>'category') is null or doc.media->(p_metadata->>'category')='null'::jsonb;end if;
  if owner='hero' then
    if coalesce(p_metadata->>'fallbackIndex','')!~'^[0-4]$' or coalesce(p_metadata->>'orientation','') not in('desktop','mobile') then return true;end if;
    if jsonb_typeof(doc.content->'hero') is distinct from 'array' then return true;end if;
    for slide in select value from jsonb_array_elements(doc.content->'hero') loop
      if slide->>'fallbackIndex' is distinct from p_metadata->>'fallbackIndex' then continue;end if;
      if p_metadata->>'orientation'='desktop' then
        visual:=case when slide->>'mediaType'='video' then slide->'poster' else slide->'desktopImage' end;
      elsif p_metadata->>'orientation'='mobile' then
        visual:=case when slide->>'mediaType'='video' then coalesce(nullif(slide->'mobileImage','null'::jsonb),nullif(slide->'mobilePoster','null'::jsonb),slide->'poster')
          else coalesce(nullif(slide->'mobileImage','null'::jsonb),slide->'desktopImage') end;
      else return true;end if;
      if visual is null or visual='null'::jsonb then return true;end if;
    end loop;
    return false;
  end if;
  if owner='finder' then
    visual:=doc.content->'finder'->(p_metadata->>'field');return visual is null or visual='null'::jsonb;
  end if;
  if owner='finder-family' then
    visual:=doc.content->'finder'->'familyVisuals'->(p_metadata->>'value')->'image';return visual is null or visual='null'::jsonb;
  end if;
  if owner='film' then
    film:=doc.content->'film';
    if film is null or jsonb_typeof(film)<>'object' then return true;end if;
    if p_metadata->>'role' in('video','desktopPoster') then return film->>'video' is null;end if;
    if p_metadata->>'role'='mobilePoster' then return film->>'mobilePoster' is null and film->>'poster' is null and film->>'video' is null;end if;
    if p_metadata->>'role'='mobilePosterFallback' then return film->>'mobilePoster' is null and film->>'poster' is null and film->>'video' is not null;end if;
  end if;
  return true; -- Unknown future descriptors are protected, never guessed unused.
end;
$$;

-- A gallery's reviewed 480/960 renditions and the finder's reviewed thumbnail
-- renditions share their existing source. Never infer an arbitrary remote URL.
create function private.builtin_source_key(p_path text)
returns text language sql immutable security invoker set search_path='' as $$
  select regexp_replace(regexp_replace(p_path,'-thumb-(160|320)[.]webp$','.webp'),'-(480|960)[.]webp$','.webp');
$$;
create function private.builtin_source_in_use(p_path text)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare classification text;
begin
  select a.classification into classification from app.media_builtin_aliases a where a.path=p_path;
  if not found or classification='unknown' then return true;end if;
  -- Preserve persisted local references, including historical order snapshots.
  if exists(select 1 from app.media_assets m where m.storage_kind='local' and private.builtin_source_key(m.object_key)=private.builtin_source_key(p_path) and (
    exists(select 1 from app.product_images i where i.media_id=m.id)
    or exists(select 1 from app.products p where p.olfactory_media_id=m.id)
    or exists(select 1 from app.order_items i where i.media_id=m.id)))
    or exists(select 1 from app.order_items i where private.builtin_source_key(i.image_source)=private.builtin_source_key(p_path)) then return true;end if;
  if classification='catalog-reference' then return false;end if;
  if classification='legacy-unused' then return false;end if;
  if not exists(select 1 from app.media_builtin_bindings b where b.path=p_path) then return true;end if;
  return exists(select 1 from app.media_builtin_bindings b where b.path=p_path and private.builtin_binding_in_use(b.kind,b.metadata));
end;
$$;

create or replace function private.media_has_references(p_id uuid)
returns boolean language sql volatile security definer set search_path='' as $$
  select exists(select 1 from app.product_images where media_id=p_id)
    or exists(select 1 from app.products where olfactory_media_id=p_id)
    or exists(select 1 from app.home_media where media_id=p_id)
    or exists(select 1 from app.order_items where media_id=p_id)
    or exists(select 1 from app.site_media_slots where asset_id=p_id)
    or exists(select 1 from app.media_builtin_aliases a where a.asset_id=p_id and private.builtin_source_in_use(a.path));
$$;

create function private.builtin_reconcile_retention()
returns void language plpgsql volatile security definer set search_path='' as $$
declare asset_id uuid;deadline timestamptz;
begin
  perform pg_advisory_xact_lock(714482397);
  for asset_id in select distinct a.asset_id from app.media_builtin_aliases a where a.asset_id is not null order by a.asset_id loop
    perform 1 from app.media_assets m where m.id=asset_id for update;
    select case when private.media_has_references(m.id) then null else coalesce(m.retire_after,clock_timestamp()+interval '24 hours') end
      into deadline from app.media_assets m where m.id=asset_id and m.storage_kind='r2' and m.status='ready';
    if found then update app.media_assets m set retire_after=deadline where m.id=asset_id and m.retire_after is distinct from deadline;end if;
  end loop;
end;
$$;

create function private.builtin_assert_available(p_kind text)
returns void language plpgsql volatile security definer set search_path='' as $$
begin
  if exists(select 1 from app.media_builtin_aliases a join app.media_assets m on m.id=a.asset_id
    where m.status in('deleting','deleted') and exists(select 1 from app.media_builtin_bindings b where b.path=a.path and b.kind=p_kind
      and private.builtin_binding_in_use(b.kind,b.metadata))) then
    raise exception 'La imagen original ya fue retirada. Sube una nueva imagen para este apartado.' using errcode='PT410';
  end if;
end;
$$;
create function private.builtin_retirement_lock()
returns trigger language plpgsql volatile security definer set search_path='' as $$
begin perform pg_advisory_xact_lock(714482397);return null;end;
$$;
create function private.builtin_retirement_changed()
returns trigger language plpgsql volatile security definer set search_path='' as $$
begin
  if tg_table_name='home_document' then perform private.builtin_assert_available('home');
  elsif tg_table_name='site_media_slots' then perform private.builtin_assert_available('site');end if;
  perform private.builtin_reconcile_retention();return null;
end;
$$;

-- Local legacy references need a closed-inventory check. Modern R2 attachments
-- keep their existing UUID status/reference validation and never scan defaults.
create function private.builtin_assert_local_media(p_id uuid)
returns void language plpgsql volatile security definer set search_path='' as $$
declare source_key text;
begin
  select private.builtin_source_key(m.object_key) into source_key from app.media_assets m where m.id=p_id and m.storage_kind='local';
  if not found then return;end if;
  perform pg_advisory_xact_lock(714482397);
  if exists(select 1 from app.media_builtin_aliases a join app.media_assets m on m.id=a.asset_id
    where private.builtin_source_key(a.path)=source_key and m.status in('deleting','deleted')) then
    raise exception 'La imagen original ya fue retirada. Sube una nueva imagen para este apartado.' using errcode='PT410';
  end if;
end;
$$;
create function private.builtin_reconcile_sources(p_keys text[])
returns void language plpgsql volatile security definer set search_path='' as $$
declare asset_id uuid;deadline timestamptz;
begin
  if p_keys is null or cardinality(p_keys)=0 then return;end if;
  if cardinality(p_keys)>2 then raise exception 'Unexpected local source scope.' using errcode='22023';end if;
  perform pg_advisory_xact_lock(714482397);
  for asset_id in select distinct a.asset_id from app.media_builtin_aliases a where a.asset_id is not null
    and private.builtin_source_key(a.path)=any(p_keys) order by a.asset_id loop
    perform 1 from app.media_assets m where m.id=asset_id for update;
    select case when private.media_has_references(m.id) then null else coalesce(m.retire_after,clock_timestamp()+interval '24 hours') end
      into deadline from app.media_assets m where m.id=asset_id and m.storage_kind='r2' and m.status='ready';
    if found then update app.media_assets m set retire_after=deadline where m.id=asset_id and m.retire_after is distinct from deadline;end if;
  end loop;
end;
$$;
create function private.builtin_catalog_media_changed()
returns trigger language plpgsql volatile security definer set search_path='' as $$
declare previous_id uuid;next_id uuid;source_keys text[];
begin
  if tg_table_name='product_images' then
    if tg_op<>'INSERT' then previous_id:=old.media_id;end if;
    if tg_op<>'DELETE' then next_id:=new.media_id;end if;
  elsif tg_table_name='products' then
    if tg_op<>'INSERT' then previous_id:=old.olfactory_media_id;end if;
    if tg_op<>'DELETE' then next_id:=new.olfactory_media_id;end if;
  else return null;end if;
  if previous_id is not distinct from next_id then return null;end if;
  select array_agg(distinct private.builtin_source_key(m.object_key)) into source_keys from app.media_assets m
    where m.id=any(array[previous_id,next_id]) and m.storage_kind='local';
  if source_keys is null then return null;end if;
  perform private.builtin_assert_local_media(next_id);
  perform private.builtin_reconcile_sources(source_keys);
  return null;
end;
$$;

create or replace function private.catalog_ready_image_for(p_reference text,p_purpose text)
returns uuid language plpgsql volatile security invoker set search_path='' as $$
declare asset_id uuid;asset app.media_assets%rowtype;
begin
  asset_id:=private.catalog_ready_image(p_reference);
  if asset_id is null then return null;end if;
  select * into asset from app.media_assets where id=asset_id;
  if asset.storage_kind='local' then perform private.builtin_assert_local_media(asset_id);
  elsif not private.media_placement_compatible(asset.mime_type,asset.width,asset.height,p_purpose) then
    raise exception 'La imagen no cumple las dimensiones de este apartado.' using errcode='22023';end if;
  return asset_id;
end;
$$;

-- Enter the common lock before existing taxonomy/settings/media locks. Preserve
-- the complete authorization, optimistic versioning and validation bodies.
do $migration$
declare signature text;definition text;replacement text;
begin
  foreach signature in array array[
    'api.admin_save_home(jsonb,jsonb,bigint,bigint,boolean,uuid)',
    'api.admin_save_site_media(text,uuid,text,bigint)',
    'api.admin_save_media_alias(text,uuid,bigint)',
    'api.admin_save_product(jsonb,bigint)',
    'api.admin_import_products(jsonb)',
    'api.admin_delete_product(uuid,bigint)',
    'private.catalog_save_product_prepared(jsonb,bigint,boolean)',
    'api.media_gc_claim(integer)'
  ] loop
    definition:=pg_get_functiondef(signature::regprocedure);
    replacement:=regexp_replace(definition,E'\nbegin[[:space:]]*\n',E'\nbegin\n  perform pg_catalog.pg_advisory_xact_lock(714482397);\n','i');
    if replacement=definition then raise exception 'Unexpected retirement lock boundary: %',signature;end if;
    if signature='api.media_gc_claim(integer)' then
      -- A collector skips an active publication transaction, preserving the
      -- existing nonblocking SKIP LOCKED maintenance contract.
      replacement:=replace(replacement,'perform pg_catalog.pg_advisory_xact_lock(714482397);',
        E'if not pg_catalog.pg_try_advisory_xact_lock(714482397) then return ''[]''::jsonb;end if;\n  perform private.builtin_reconcile_retention();');
    end if;
    execute replacement;
  end loop;
end;
$migration$;

create trigger builtin_retirement_olfactory_lock before insert or delete or update of olfactory_media_id on app.products
  for each statement execute function private.builtin_retirement_lock();
create trigger builtin_retirement_olfactory_changed after insert or delete or update of olfactory_media_id on app.products
  for each row execute function private.builtin_catalog_media_changed();
create trigger builtin_retirement_gallery_lock before insert or update or delete on app.product_images
  for each statement execute function private.builtin_retirement_lock();
create trigger builtin_retirement_gallery_changed after insert or update or delete on app.product_images
  for each row execute function private.builtin_catalog_media_changed();

-- Statement triggers also protect internal maintenance and trusted SQL writers.
do $migration$
declare relation text;
begin
  foreach relation in array array['home_document','home_media','site_media_slots','media_builtin_aliases'] loop
    execute format('create trigger builtin_retirement_lock before insert or update or delete on app.%I for each statement execute function private.builtin_retirement_lock()',relation);
    execute format('create trigger builtin_retirement_changed after insert or update or delete on app.%I for each statement execute function private.builtin_retirement_changed()',relation);
  end loop;
end;
$migration$;

create function api.builtin_media_resolve(p_path text)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce((select jsonb_build_object('asset',case when m.status='ready' and m.storage_kind='r2' then private.media_document(m.id) else null end,
    'retired',coalesce(m.status in('deleting','deleted'),false))
    from app.media_builtin_aliases a left join app.media_assets m on m.id=a.asset_id where a.path=p_path),jsonb_build_object('asset',null,'retired',false));
$$;
create function api.builtin_media_build_state()
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('items',coalesce(jsonb_agg(jsonb_build_object('path',a.path,'status',case
    when m.status='ready' and m.storage_kind='r2' and m.width=a.width and m.height=a.height then 'ready'
    when m.status in('deleting','deleted') and not private.builtin_source_in_use(a.path) then 'retired'
    else 'unavailable' end) order by a.path),'[]'::jsonb))
  from app.media_builtin_aliases a left join app.media_assets m on m.id=a.asset_id;
$$;

grant create on schema private,api to aro_media_executor;
alter function private.builtin_binding_in_use(text,jsonb) owner to aro_media_executor;
alter function private.builtin_source_key(text) owner to aro_media_executor;
alter function private.builtin_source_in_use(text) owner to aro_media_executor;
alter function private.builtin_reconcile_retention() owner to aro_media_executor;
alter function private.builtin_assert_available(text) owner to aro_media_executor;
alter function private.builtin_assert_local_media(uuid) owner to aro_media_executor;
alter function private.builtin_reconcile_sources(text[]) owner to aro_media_executor;
alter function private.builtin_catalog_media_changed() owner to aro_media_executor;
alter function private.builtin_retirement_lock() owner to aro_media_executor;
alter function private.builtin_retirement_changed() owner to aro_media_executor;
alter function api.builtin_media_resolve(text) owner to aro_media_executor;
alter function api.builtin_media_build_state() owner to aro_media_executor;
revoke create on schema private,api from aro_media_executor;
revoke all on function private.builtin_binding_in_use(text,jsonb),private.builtin_source_key(text),private.builtin_source_in_use(text),private.builtin_reconcile_retention(),
  private.builtin_assert_available(text),private.builtin_assert_local_media(uuid),private.builtin_reconcile_sources(text[]),private.builtin_catalog_media_changed(),
  private.builtin_retirement_lock(),private.builtin_retirement_changed(),api.builtin_media_resolve(text),api.builtin_media_build_state()
  from public,anon,authenticated,service_role;
grant execute on function private.builtin_reconcile_retention() to aro_media_executor,aro_catalog_admin_executor;
grant execute on function private.builtin_assert_local_media(uuid) to aro_catalog_admin_executor;
grant execute on function api.builtin_media_resolve(text),api.builtin_media_build_state() to anon,authenticated,service_role;

-- Seeded originals already copied into R2 retain a fresh recovery window only
-- when no effective owner remains. Existing terminal claims are never revived.
select private.builtin_reconcile_retention();
comment on table app.media_builtin_bindings is 'Closed fallback ownership inventory; unknown descriptors protect bytes rather than infer non-use.';
notify pgrst,'reload schema';
