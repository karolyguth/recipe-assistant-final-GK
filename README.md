# Receptasszisztens – záró projekt

RAG alapú AI asszisztens Jeff Thompson 85 receptjéhez. Dokumentumokat dolgoz fel, a releváns recepteket visszakeresi és újrarangsorolja, a válaszokat streamelve adja. Mindhárom szinten (RAG, prompt, alkalmazás) mérve van, és a működését egy monitoring dashboard mutatja.

**Technológia:** Next.js 14 (App Router), Vercel AI SDK 5, OpenAI (`gpt-5`, `text-embedding-3-large`, `gpt-4.1-mini`), Postgres + pgvector, Drizzle ORM, Docker Compose.

## Architektúra

```mermaid
flowchart LR
  U[Böngésző] -->|kérdés, streamelt válasz| C[/api/chat/]
  U -->|feltöltés, lista, törlés| D[/api/upload, /api/process, /api/documents/]
  U --> V[/dashboard/]
  D --> P[Feldolgozás: receptenként 1 chunk + összefoglaló sor] --> E[text-embedding-3-large] --> DB[(Postgres + pgvector)]
  C --> L[gpt-5 tool hívásokkal]
  L -->|getInformation| S[Keresés: pgvector top 20] --> R[LLM reranker gpt-4.1-mini] --> L
  L -->|addResource| DB
  C -->|beszélgetés mentése| DB
  C -->|tokenek, költség, latencia| M[(chat_metrics)] --> V
```

| Rész | Megoldás |
|---|---|
| **Dokumentum feldolgozás, chunkolás** | `.md` / `.txt` feltöltés, ellenőrzés (típus, méret, üres, duplikátum). Receptenként egy chunk, elé egy összefoglaló sor (cím, nehézség, idő, hozzávalók száma); a hosszú dokumentumok szekciónként, a szövegek bekezdésenként, átfedéssel bontódnak. `lib/ai/chunking.ts`, `lib/documents.ts` |
| **Embedding** | OpenAI `text-embedding-3-large` (3072 dimenzió); a RAG értékelés alapján választva. `lib/ai/embedding.ts` |
| **Vektor adatbázis** | Postgres + pgvector, koszinusz hasonlóság; a dokumentum törlésekor a chunkjai is törlődnek |
| **Retrieval és reranking** | Két lépcső: a pgvector 20 jelöltet ad, egy LLM reranker (`gpt-4.1-mini`) 0–10 között pontozza őket, a legjobb 4 megy a válaszoló modellhez. `lib/ai/rerank.ts` |
| **Válaszgenerálás** | `gpt-5` a `streamText`-tel, két toollal: `getInformation` (keresés) és `addResource` (a felhasználó kérésére jegyzet mentése). A system prompt: csak a gyűjtemény receptjei, hiányzó ételnél őszinte válasz, a hangnem a felhasználóhoz igazodik. `app/api/chat/route.ts` |
| **Webes felület** | Chat streamelt válaszokkal, a keresés részletei kinyitható panelen; feltöltés, dokumentumlista szűréssel, törléssel, újrafeldolgozással; telefonon is használható |
| **Beszélgetések** | Minden beszélgetés mentődik (üzenetek a tool hívásokkal együtt), oldalsávban váltható és törölhető, újratöltés után is megmarad (az azonosító az URL-ben) |
| **Monitoring** | Kérésenként: tokenek (chat, reasoning, cache-elt, embedding, reranker), becsült költség, első token ideje, teljes válaszidő, keresési és reranking idő, tool hívások, hibák. Dashboard: `/dashboard` |

## Telepítés

**Szükséges:** Node.js 20+, pnpm (`corepack enable`), Docker, OpenAI API kulcs.

```bash
cp .env.example .env            # állítsd be az OPENAI_API_KEY-t
git clone --depth 1 https://github.com/jeffThompson/Recipes.git data/recipes
pnpm install
```

| Változó | Kötelező | Leírás |
|---|---|---|
| `OPENAI_API_KEY` | igen | chat modell, embedding, reranker |
| `DATABASE_URL` | igen | `postgres://postgres:postgres@localhost:5433/rag_starter` |
| `CHAT_MODEL` | nem | alapértelmezés `gpt-5`; a `gpt-4o-mini` gyorsabb és olcsóbb |
| `WEB_PORT` | nem | a webkonténer portja Docker Compose-ban (alapértelmezés 3000) |
| `DB_PORT` | nem | a Postgres portja a hoston (alapértelmezés 5433) |

**Teljes stack Dockerrel** (Postgres + webapp; a migrációk induláskor lefutnak):

```bash
docker compose up -d --build
pnpm db:seed                    # a receptek betöltése a hostról (localhost:5433)
```

**Fejlesztői mód:**

```bash
docker compose up -d postgres   # csak az adatbázis
pnpm db:migrate
pnpm db:seed                    # data/recipes/recipes, vagy: pnpm db:seed <mappa>
pnpm dev                        # http://localhost:3000
```

- A seed újrafuttatható: a már feldolgozott fájlokat átugorja.
- `pnpm db:reprocess`: minden fel nem dolgozott dokumentum (pl. embedding modell váltás után) újra feldolgozása.
- `pnpm db:studio`: az adatbázis megtekintése (ha a Studio a „Connecting…” állapotban megakad: `brew install mkcert && mkcert -install`).

## Használat

- **Kérdezés:** írj a chatbe (pl. „What can I cook with chickpeas?”). A válasz streamelve érkezik; a „Show how I found this” alatt látszik, mit keresett a modell, és milyen recepteket talált, hasonlósági és rerank pontszámmal.
- **Beszélgetések:** a bal oldali „Conversations” listában. „New chat”: új beszélgetés; a régiek visszanyithatók és törölhetők.
- **Dokumentumok:** az „Add recipes” panelen `.md` vagy `.txt` fájl tölthető fel (max. 1 MB); feltöltés után azonnal kereshető. A „Knowledge base” listában szűrhető, törölhető, a hibás újra feldolgozható.
- **Memória:** „Remember that I'm vegetarian” – a modell elmenti, és a későbbi válaszoknál figyelembe veszi.
- **Visszajelzés:** minden válasz alatt 👍 / 👎, 👎 után megjegyzéssel.
- **Monitoring:** a jobb felső „Monitoring” gomb, vagy `/dashboard`.

## API dokumentáció

A hibák formátuma mindenhol `{ "error": "<üzenet>" }`.

| Végpont | Bemenet | Siker | Hibák |
|---|---|---|---|
| `POST /api/upload` | `multipart/form-data`, `file`: `.md`/`.txt`, max. 1 MB | `201 { id, fileName, title, source, status: "uploaded" }` | 400, 409 már feltöltve, 413 túl nagy |
| `POST /api/process` | JSON `{ "id" }` | `200 { id, status: "processed", chunkCount }` | 400, 404, 409 feldolgozás alatt, 500 |
| `GET /api/documents` | – | `200 { documents: [...] }` (chunkszámmal, metaadatokkal) | 500 |
| `DELETE /api/documents/:id` | – | `200 { id, deleted: true }`, a chunkok is törlődnek | 404 |
| `POST /api/chat` | `{ id?, messages: UIMessage[] }` | streamelt válasz (`useChat`); ha van `id`, a beszélgetés mentődik | 500 |
| `POST /api/chat` + `Accept: application/json` | ugyanaz | `200 { messageId, answer, contexts, toolCalls, metrics }`, nem streamelve (evaluációhoz, eszközökhöz) | 500 |
| `GET /api/conversations` | – | `200 { conversations: [{ id, title, updatedAt, messageCount }] }` | 500 |
| `GET /api/conversations/:id` | – | `200 { conversation, messages, feedback }` | 404 |
| `DELETE /api/conversations/:id` | – | `200 { id, deleted: true }`, az üzenetek is törlődnek | 404 |
| `POST /api/feedback` | JSON `{ messageId, conversationId?, rating: 1 \| -1 \| null, comment? }` | `200 { messageId, rating }` | 400 |

```bash
curl -F "file=@data/recipes/recipes/hummus.md" http://localhost:3000/api/upload
curl -X POST -H "Content-Type: application/json" -d '{"id":"<id>"}' http://localhost:3000/api/process
curl -H "Content-Type: application/json" -H "Accept: application/json" \
  -d '{"messages":[{"id":"1","role":"user","parts":[{"type":"text","text":"How do I make hummus?"}]}]}' \
  http://localhost:3000/api/chat
```

## Evaluation

Háromszintű értékelés az `eval/` mappában. A részletes eredmények és következtetések: **[eval/RESULTS.md](eval/RESULTS.md)**.

| Szint | Tesztesetek | Mit mér | Eredmény |
|---|---|---|---|
| **RAG** | 125 (40 kézzel írt + 85 LLM által generált) | precision@4, recall@4, MRR, hit@1; chunkolás, embedding modell és reranking összehasonlítása | MRR 0,99, R@4 0,99; tág kérdéseknél R@4 0,86 → 0,96 a kiinduló rendszerhez képest |
| **Prompt** | 18 single-turn | helyesség a ground truth-hoz (a kurzus módszere), kontextus relevancia, hűség és hallucináció, válasz relevancia, elvárt viselkedés – LLM-as-a-Judge (`gpt-4.1`) | 94% helyes, 0 hallucináció, 100% elvárt viselkedés |
| **Alkalmazás** | 12 teljes felhasználói út | szimulált userek (perszóna, cél, sorsolt tulajdonságok), válaszminőség, latencia, szimulált elégedettség | 12/12 cél, elégedettség 4,42/5, válaszidő medián 30 s |

```bash
pnpm eval:rag      # az app fusson (pnpm dev); OPENAI_API_KEY a .env-ben
pnpm eval:prompt
pnpm eval:app
```

## Monitoring

A chat végpont minden kérésnél elment egy sort a `chat_metrics` táblába:
- **Tokenek:** chat (input, cache-elt, output, reasoning), embedding, reranker.
- **Becsült költség:** a `lib/monitoring/pricing.ts` árlistája szerint.
- **Időzítések:** első token, teljes válaszidő, keresési és reranking idő.
- **Egyéb:** lépések és tool hívások, valamint az állapot (sikeres, hibás vagy a felhasználó leállította).

A `/dashboard` ebből számol, időszakválasztóval (24 óra, 7 nap, 30 nap, minden):
- **Fő számok:** kérések, hibaarány, az első token és a teljes válaszidő mediánja és p95-e, költség, tokenek.
- **Diagramok:** kérések, válaszidő (p50 és p95) és költség időben; hover tooltip és táblázatos nézet.
- **Listák:** hibás vagy leállított kérések, felhasználói visszajelzések, a leglassabb kérések.

## Tanulságok

- **Az értékelés megváltoztatta a rendszert:** az első reranker (helyi cross-encoder) a mérés szerint rontott, és terhelte a gépet. Helyette `3-large` embedding és LLM reranker lett, ami a tág kérdéseknél a legtöbbet javít.
- **A tesztkészlet nehézsége számít:** a generált kérdések megnevezik az ételt, ezért ott minden beállítás ~1,0. A beállítások közti különbséget a kézzel írt tág kérdések mutatják meg.
- **Az értékelőt is ellenőrizni kell:**
  - a prompt szintű judge első változata az általános tanácsként jelölt mondatokat is hallucinációnak vette
  - az alkalmazás szintű judge minden esetre maximális pontot adott, a valódi gyengeségeket kézi átolvasás találta meg (pl. csirkemell helyett csirkecombos recept)
- **A késleltetést a modell adja:** a válaszidő mediánja ~22–30 s, ennek nagy része a `gpt-5` gondolkodása; a keresés és a reranking kb. 4 s. A monitoring nélkül ez nem látszana ilyen pontosan.

**Fejlesztési lehetőségek:**
- gyorsabb chat modell vagy a reranker kihagyása a pontos kérdéseknél
- a judge kalibrálása kézi pontozással
- nehezebb, több kört kikényszerítő szimulációk
- vektorindex (HNSW) nagyobb adatmennyiségnél
- metaadat szűrők (pl. „30 percen belül”) a keresésben

A 3. heti állapot teszt riportja: [docs/test-results.md](docs/test-results.md).
