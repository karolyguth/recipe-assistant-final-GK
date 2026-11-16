# RAG szintű értékelés

40 teszteset (30 pontos és 10 tág kérdés), 85 recept. Chunkok száma: recipe: 85, fixed: 239, section: 442.
Metrikák receptszinten: P@4 és R@4 (az éles rendszer 4 receptet ad a modellnek), MRR (az első releváns recept helye, 10-ig), Hit@1.
Az idő oszlop: a memóriabeli LLM rerank változatoknál a reranker válaszai cache-ből jönnek; a valós keresési idő (embedding + pgvector + LLM rerank) az élő rendszer sorában látszik.
A pontos kérdéseknek 1-2 releváns receptje van, ezért ott a P@4 felső korlátja kb. 0,3; a tág kérdéseknél 2-5 recept is jó, ott a P@4 is beszédes.

## Összes kérdés

| Beállítás | P@4 | R@4 | MRR | Hit@1 | Idő / kérdés (ms) |
|---|---|---|---|---|---|
| Receptenként, 3-small, rerank nélkül | 0.356 | 0.953 | 0.963 | 0.925 | 0 |
| Fix 800 karakter, 3-small, rerank nélkül | 0.35 | 0.948 | 0.931 | 0.875 | 1 |
| Szekciónként, 3-small, rerank nélkül | 0.363 | 0.963 | 0.975 | 0.95 | 1 |
| Receptenként, 3-large, rerank nélkül | 0.363 | 0.955 | 1 | 1 | 0 |
| Receptenként, 3-small, LLM rerank (gpt-4.1-mini) | 0.369 | 0.978 | 1 | 1 | 0 |
| Receptenként, 3-large, LLM rerank (gpt-4.1-mini) – éles | 0.381 | 0.989 | 1 | 1 | 1 |
| Élő rendszer: pgvector + LLM rerank (a chat kódja) | 0.381 | 0.989 | 1 | 1 | 2825 |

## Pontos kérdések (egy konkrét étel vagy technika)

| Beállítás | P@4 | R@4 | MRR | Hit@1 | Idő / kérdés (ms) |
|---|---|---|---|---|---|
| Receptenként, 3-small, rerank nélkül | 0.275 | 0.983 | 0.983 | 0.967 | 0 |
| Fix 800 karakter, 3-small, rerank nélkül | 0.283 | 1 | 0.983 | 0.967 | 1 |
| Szekciónként, 3-small, rerank nélkül | 0.275 | 0.983 | 1 | 1 | 1 |
| Receptenként, 3-large, rerank nélkül | 0.275 | 0.983 | 1 | 1 | 0 |
| Receptenként, 3-small, LLM rerank (gpt-4.1-mini) | 0.283 | 1 | 1 | 1 | 0 |
| Receptenként, 3-large, LLM rerank (gpt-4.1-mini) – éles | 0.283 | 1 | 1 | 1 | 1 |
| Élő rendszer: pgvector + LLM rerank (a chat kódja) | 0.283 | 1 | 1 | 1 | 2753 |

## Tág kérdések (több recept is jó válasz)

| Beállítás | P@4 | R@4 | MRR | Hit@1 | Idő / kérdés (ms) |
|---|---|---|---|---|---|
| Receptenként, 3-small, rerank nélkül | 0.6 | 0.863 | 0.9 | 0.8 | 0 |
| Fix 800 karakter, 3-small, rerank nélkül | 0.55 | 0.793 | 0.775 | 0.6 | 1 |
| Szekciónként, 3-small, rerank nélkül | 0.625 | 0.902 | 0.9 | 0.8 | 1 |
| Receptenként, 3-large, rerank nélkül | 0.625 | 0.872 | 1 | 1 | 0 |
| Receptenként, 3-small, LLM rerank (gpt-4.1-mini) | 0.625 | 0.91 | 1 | 1 | 0 |
| Receptenként, 3-large, LLM rerank (gpt-4.1-mini) – éles | 0.675 | 0.955 | 1 | 1 | 0 |
| Élő rendszer: pgvector + LLM rerank (a chat kódja) | 0.675 | 0.955 | 1 | 1 | 3041 |

## Ahol az éles beállításnál a releváns recept nem az első helyen van

| Eset | Kérdés | Releváns | Első 4 találat |
|---|---|---|---|
