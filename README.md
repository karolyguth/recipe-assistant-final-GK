# Receptasszisztens – záró projekt

RAG alapú chat asszisztens Jeff Thompson 85 receptjéhez (Next.js 14, Vercel AI SDK, OpenAI, Postgres + pgvector, Drizzle ORM).

## Projekt setup

**Szükséges:** Node.js 20+, pnpm (`corepack enable`), Docker, OpenAI API kulcs.

```bash
cp .env.example .env            # állítsd be az OPENAI_API_KEY-t
git clone --depth 1 https://github.com/jeffThompson/Recipes.git data/recipes
```

| Változó          | Kötelező | Leírás                                                        |
| ---------------- | -------- | ------------------------------------------------------------- |
| `OPENAI_API_KEY` | igen     | chat modell és embedding (`text-embedding-3-small`)           |
| `DATABASE_URL`   | igen     | `postgres://postgres:postgres@localhost:5433/rag_starter`     |
| `CHAT_MODEL`     | nem      | alapértelmezés `gpt-5`; a `gpt-4o-mini` gyorsabb és olcsóbb   |
| `WEB_PORT`       | nem      | a webkonténer portja Docker Compose-ban (alapértelmezés 3000) |
| `DB_PORT`        | nem      | a Postgres portja a hoston (alapértelmezés 5433)              |

**Teljes stack Dockerrel** (Postgres + webapp, a migrációk induláskor lefutnak):

```bash
docker compose up -d --build
pnpm install && pnpm db:seed    # receptek betöltése (a hostról, localhost:5433-re)
```

**Fejlesztői mód:**

```bash
pnpm install
docker compose up -d postgres   # csak az adatbázis
pnpm db:migrate
pnpm db:seed                    # data/recipes/recipes, vagy: pnpm db:seed <mappa>
pnpm dev                        # http://localhost:3000
```

A seed script újrafuttatható: a már feldolgozott fájlokat átugorja, a hibásakat újrapróbálja.

**Adatbázis megtekintése:** `pnpm db:studio`, majd https://local.drizzle.studio.

- **Régi `drizzle-kit` verzióval nálam nem működött.** A `package.json` már a frissített verziókat tartalmazza; ha mégis gond van:
  `pnpm add -D drizzle-kit@latest && pnpm add drizzle-orm@latest`
- **Ha a Studio a „Connecting…” állapotban megakad:** `brew install mkcert && mkcert -install`, majd futtasd újra a projekt mappájából.

## API dokumentáció

A hibák formátuma mindenhol `{ "error": "<üzenet>" }`, a hibák a szerver konzolra is naplózódnak.

| Végpont                     | Bemenet                                                               | Siker                                                                                                             | Hibák                                                                |
| --------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `POST /api/upload`          | `multipart/form-data`, `file` mező: `.md`/`.txt`, nem üres, max. 1 MB | `201 { id, fileName, title, source, status: "uploaded" }`                                                         | 400 hibás bemenet, 409 már feltöltve, 413 túl nagy                   |
| `POST /api/process`         | JSON `{ "id" }`                                                       | `200 { id, status: "processed", chunkCount }`                                                                     | 400, 404 ismeretlen id, 409 feldolgozás alatt, 500 embedding/DB hiba |
| `GET /api/documents`        | –                                                                     | `200 { documents: [{ id, fileName, title, source, status, error, metadata, chunkCount, createdAt, updatedAt }] }` | 500                                                                  |
| `DELETE /api/documents/:id` | –                                                                     | `200 { id, deleted: true }`, a chunkok is törlődnek                                                               | 404 ismeretlen id                                                    |
| `POST /api/chat`            | a beszélgetés `UIMessage[]` formában (`useChat`)                      | streamelt válasz a tool hívásokkal együtt                                                                         | 500                                                                  |

```bash
curl -F "file=@data/recipes/recipes/hummus.md" http://localhost:3000/api/upload
curl -X POST -H "Content-Type: application/json" -d '{"id":"<id>"}' http://localhost:3000/api/process
curl http://localhost:3000/api/documents
curl -X DELETE http://localhost:3000/api/documents/<id>
```

## Tesztelési eredmények összefoglalása

A teljes riport: [docs/test-results.md](docs/test-results.md).

- **Funkcionális tesztek:** 18/18 API teszt sikeres, a szélső esetekkel együtt:
  - rossz típus, üres, túl nagy, bináris fájl
  - duplikált feltöltés, ismeretlen id
  - kétszeri feldolgozás, kaszkád törlés
- **Chunkolás:** receptenként 1 chunk, a múlt heti mérés alapján. Ez a stratégia 10 kérdésből 9-nél hozta első helyen a helyes receptet; a szekciónkénti és a fix méretű darabolás 8-nál.
- **Keresési pontosság:** a magyar tesztkérdések közvetlen keresése többnyire nem talált:
  - 2 kérdésre egyáltalán nem volt találat, 2-re rossz recept jött;
  - angol kulcsszavakkal ugyanezek a helyes recepteket hozták (pl. „chicken breast” → Chicken Schnitzel, 0,48).
- **A system prompt hatása:**
  - az eredeti prompttal 1/5 érdemi válasz („Sorry, I don't know”), az új prompttal 5/5;
  - a modell angolul keres, de a felhasználó nyelvén válaszol.
- **Tool használat:**
  - a modell mindig keresett válasz előtt, kérdésenként 2–3 átfogalmazott angol lekérdezéssel;
  - `addResource`-t csak kifejezett kérésre hívott.
- **Válaszidő:**
  - keresés 0,2–0,8 s;
  - egy recept feldolgozása 0,8–1,8 s;
  - `gpt-5`: első szöveg 18–26 s;
  - `gpt-4o-mini`: első szöveg 2–6 s, de csak egy keresés, és kevésbé tartja a szabályokat.
- **Nagyobb adathalmaz:** a keresési idő lineárisan nő (87 chunk: 0,9 ms, 8 700: ~75 ms, 34 800: ~375 ms); a Postgres memóriája 40-ről 183 MiB-ra.
- **A tesztelés során talált és javított hibák:**
  - duplikált feltöltés;
  - a magyar lekérdezés nem talált;
  - üres válasz, amikor elfogyott a lépésszám;
  - a mentett preferencia figyelmen kívül maradt;
  - a kiinduló projekt build hibái.

## Tanulságok és fejlesztési lehetőségek

**Tanulságok**

- **A keresést érdemes a generálástól külön mérni:** így derült ki, hogy a magyar kérdés és az angol receptek között a keresés nem működik.
- **A chunkolás adatfüggő:** a kiinduló, mondatonkénti bontás széttöri a hozzávalólistákat; rövid, strukturált receptekhez az egész recept a legjobb egység.
- **A system prompt nagy hatású, de nem garancia:** amit mindig teljesíteni kell, azt kódban érdemes kikényszeríteni. Nálam a mentett jegyzetek a promptba kerülnek, és az utolsó lépés mindig a válaszé.
- **A modellválasztás kompromisszum:** a gpt-5 okosabban keres, de 20–30 s-ig gondolkodik; a késleltetést a nyelvi modell adja, nem az adatbázis.

**Fejlesztési lehetőségek**

- **Vektorindex (pgvector HNSW)** kb. 10 000 chunk felett.
- **Hibrid keresés:** kulcsszavas és vektoros keresés együtt, újrarangsorolással.
- **Metaadat szűrők tool paraméterként:** pl. „30 percen belül”, „könnyű”.
- **Beszélgetések mentése és 👍/👎 visszajelzés.**
- **Markdown megjelenítés a válaszokban.**
- **Automatizált kiértékelés:** a tesztkérdésekből regressziós adathalmaz.
