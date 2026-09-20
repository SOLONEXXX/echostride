<div align="center">

# ECHOSTRIDE

### Kämpfe an der Seite des Geistes, der du warst.

**Ein First-Person-Shooter, gebaut um eine einzige Idee:**
*Eine Kopie von dir aus der Vergangenheit — drei Sekunden alt — kämpft an deiner Seite. Und du kannst mit ihr den Platz tauschen.*

<sub>Die vollständige Dokumentation ist auf Englisch: <a href="README.md">README.md</a> · <a href="docs/">docs/</a></sub>

</div>

![Die Carillon](docs/shots/02-arena.png)

---

## Die Mechanik

Ein durchscheinender, violetter **Strider** folgt dir — **drei Sekunden hinter
dir**. Er geht, wo du gegangen bist. Er schießt, was du geschossen hast. Er
macht **echten Schaden** (60 % von deinem), verbraucht keine Munition — und
**er kann sterben**.

| | |
|---|---|
| **`Q` — SHIFT** | Tausche den Platz mit deinem Echo. Du springst dorthin zurück, wo du vor drei Sekunden standest, mit der Geschwindigkeit, die du damals hattest — und dein Echo läuft die Route weiter, die du gerade verlassen hast. Ein Knopf macht aus einem Körper eine Zange. |
| **RESONANZ** | Triffst du denselben Gegner wie dein Echo innerhalb einer **halben Sekunde**, ist das ein **Resonanzschlag**: doppelter Schaden — und das Einzige im Spiel, das schwere Panzerung bricht. Um das absichtlich zu schaffen, musst du **vor drei Sekunden** entschieden haben, worauf du jetzt schießt. |
| **`F` — COLLAPSE** | Opfere dein Echo. Es implodiert, zieht Gegner hinein, und der Schaden skaliert damit, wie viel **es selbst** im Leben ausgeteilt hat. Danach bist du fünf Sekunden allein — und du merkst es. |
| **PHASE-CATCH** | Ein tödlicher Treffer, dein Echo lebt, 50 Flux auf dem Konto? Dein vergangenes Ich fängt dich auf. Eine Wiederbelebung, die du Sekunden vorher bezahlt hast. |
| **DER REGLER** | Stelle die Verzögerung zwischen **1,5 s und 5,0 s** ein. Kurz: fast doppelter Schaden direkt vor deiner Nase. Lang: eine zweite Front, einen Raum weiter. Die tiefste Build-Entscheidung des Spiels — und sie ist eine einzige Zahl. |

---

## Starten

```bash
npm install
npm run dev          # → http://127.0.0.1:5173
npm run build        # Produktions-Build: 620 kB, ~161 kB gzipped, null Asset-Dateien
npm test             # Headless: startet den echten Build und prüft die Mechanik
```

Die **Design-Galerie** — jede Figur, jede Waffe und jeder Grundriss, live
gerendert aus demselben Code wie das Spiel — liegt unter **`/gallery.html`**.

---

## Steuerung

| | | | |
|---|---|---|---|
| Laufen | `W` `A` `S` `D` | **Zum Echo shiften** | **`Q`** |
| Springen / Wandsprung | `Leertaste` | **Echo kollabieren** | **`F`** |
| Rutschen *(ab Tempo)* | `Strg` | Verzögerung ± | `+` `-` |
| Sprinten | `Umschalt links` | Feuer / Klinge / Nachladen | `LMB` `V` `R` |

Gamepad wird vollständig unterstützt — **SHIFT liegt auf `RB`**, dem besten
Knopf am Controller, weil es ein Bewegungsverb ist, das man unter Beschuss
drückt. Alles ist frei belegbar.
Begründung für jede einzelne Taste: **[docs/CONTROLS.md](docs/CONTROLS.md)**

---

## Das Arsenal

Jede Waffe ist für sich gut — **und bedeutet etwas anderes in der Hand deines Echos.**

| | Echo-Synergie | Was sie von dir verlangt |
|---|---|---|
| **SPLITTER Mk.II** · Salvengewehr | **CONVERGE** — Schüsse durchschlagen ein Ziel, das dein Echo gerade getroffen hat | Triffst du dasselbe Ziel zweimal, drei Sekunden auseinander? |
| **REND** · Harmonische Schrotflinte | **STANDING WAVE** — +80 %, wenn du und dein Echo von gegenüberliegenden Seiten feuert | Schaffst du es in drei Sekunden auf *die andere Seite*? |
| **KETTLE** · Verzögerungswerfer | **SYNCHRONY** — die Zündzeit **ist** deine Echo-Verzögerung | Weißt du, wo der Kampf in drei Sekunden stattfindet? |
| **LATTICE** · Fessel-Gewehr | **WEB** — dein Echo legt auch Fesseln, das Netz ist immer größer als das, was du gezogen hast | Planst du eine Form statt eines Schusses? |
| **THRESH** · Kinetische Klinge | **RETURN** — parierte Geschosse werden in die Zeitlinie deines Echos geschoben | Schenkst du deinem vergangenen Ich eine Waffe? |

---

## Die Stillness

Ein Orden, der Rekursion für eine Krankheit hält. Jeder Gegnertyp lehrt **genau
eine** Lektion über das Echo — und ist **auf langweilige Weise unbesiegbar**,
wenn man sie ignoriert.

| | |
|---|---|
| **WARDEN** | Dein Echo ist ein Körper. Sie jagen es. Nutze das. |
| **PSALM** | Dinge können ein bewegtes Ziel vorhalten. Du auch. |
| **MONOLITH** | Die Frontpanzerung schluckt *alles*. Nur Resonanz bricht sie. |
| **HUSH** | Unsichtbar — sein eigenes Echo aber nicht. Lies es, und schieße drei Sekunden voraus. |
| **CANTOR** | Sein Feld friert die Wiedergabe deines Echos ein. Töte ihn zuerst. |

---

## Woraus es sich entwickelt

| | Übernommen | Verändert |
|---|---|---|
| **Quake** | Gerichtete Luftbeschleunigung, Strafe-Jumping | Fast wortwörtlich behalten — es wurde seither nicht verbessert |
| **Titanfall 2 / Apex** | Slide, Wall-Run, Slide-Hop-Ketten | **Folgenreich** gemacht: deine Route wird die Route deines Verbündeten |
| **DOOM Eternal** | Aggression als Überleben, Ressourcenknappheit | Drei Ressourcen auf **eine** Leiste reduziert: Flux, verdient durch Schaden *und* Tempo |
| **ULTRAKILL** | Stil-Meter, das Kreativität belohnt | „Sei abwechslungsreich" ersetzt durch „sei **koordiniert**" |
| **Halo** | Sandbox-Vielfalt, situative Waffen | Die situative Identität kommt vom Echo, nicht von einer Schwächen-Tabelle |
| **SUPERHOT** | Zeit als etwas, in dem man denkt | Dasselbe Denken, aber in voller Geschwindigkeit — ein Shooter, kein Puzzle |

Jedes dieser Spiele hat **eine** Schleife perfektioniert und die anderen
drangeschraubt. ECHOSTRIDE führt vier Schleifen auf eine Frage zurück —
**was wirst du in drei Sekunden getan haben wollen?** — und lässt Aggression,
Bewegung, Stil und Sandbox-Lesen allesamt Antworten darauf sein.

---

## Dokumentation (englisch)

| | |
|---|---|
| [GAME_DESIGN.md](docs/GAME_DESIGN.md) | Das vollständige Design-Dokument, inklusive offener Probleme |
| [ECHO_SHIFT.md](docs/ECHO_SHIFT.md) | Die Mechanik: Regeln, Tuning-Tabellen, und was gestrichen wurde |
| [CHARACTERS.md](docs/CHARACTERS.md) | Der Strider, fünf Harness-Varianten, das Bestiarium |
| [WEAPONS.md](docs/WEAPONS.md) | Das Arsenal und seine Echo-Synergien |
| [MAPS.md](docs/MAPS.md) | Die drei Gesetze einer ECHOSTRIDE-Map; CARILLON im Detail |
| [CONTROLS.md](docs/CONTROLS.md) | Vollständige Belegung mit Begründung |
| [ART_DIRECTION.md](docs/ART_DIRECTION.md) | Chromatic Brutalism: das Farbgesetz, Formensprache, Sound |

---

<div align="center">
<sub><i>Carillon: ein Glockenspiel, bei dem jeder angeschlagene Ton weiterklingt,<br>
während du den nächsten spielst. Schlägst du einen Akkord,<br>
begleitest du dich selbst mit Tönen, die du Sekunden zuvor gemacht hast.</i></sub>
</div>
