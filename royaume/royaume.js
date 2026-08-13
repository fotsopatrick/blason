/* Le Royaume — la couche 2D de Blason.
 *
 * POURQUOI CETTE PAGE EXISTE
 *
 * La source React de Blason a disparu : le depot ne contient que le build
 * (dist/). Plutot que de reconstruire une application entiere a l'aveugle,
 * cette page est autonome, sans dependance, et parle a la meme API avec la
 * meme session (cle localStorage « questforge-token »). Le React continue de
 * tourner à côté, intact.
 *
 * CE QU'ELLE APPORTE, ET QUE DUOLINGO N'A PAS
 *
 * Duolingo tient par la serie, l'objectif du jour et la correction immediate.
 * On a les trois. Le cran au-dessus, c'est que le progres devient un LIEU :
 * chaque competence exigee par l'offre est un batiment sur la carte, et le
 * batiment se reconstruit a mesure qu'on progresse — ruine, bivouac, cabane,
 * tour, forteresse, citadelle. On ne collectionne pas des points : on releve
 * un royaume, et on grave son blason.
 *
 * DISCIPLINE DE CHARGE (voir server/charge.cjs)
 *
 * Le serveur utilise SQLite en mode synchrone : chaque requete bloque la
 * boucle d'evenements. Une page animee qui interroge l'API a chaque image la
 * mettrait a genoux. Donc, regle absolue ici :
 *
 *   - le rendu (60 im/s) est PUREMENT LOCAL, il ne declenche aucun reseau ;
 *   - on n'appelle l'API que sur trois evenements : chargement, reponse
 *     envoyee, retour de seance ;
 *   - l'animation s'arrete quand l'onglet passe en arriere-plan ;
 *   - aucune scrutation periodique. Nulle part.
 */
(function () {
  'use strict';

  // ------------------------------------------------------------------ API
  var CLE = 'questforge-token';
  var jeton = null;
  try { jeton = localStorage.getItem(CLE); } catch (e) { jeton = null; }

  function api(chemin, options) {
    options = options || {};
    var en = { 'Content-Type': 'application/json' };
    if (jeton) en.Authorization = 'Bearer ' + jeton;
    return fetch('/api' + chemin, {
      method: options.methode || 'GET',
      headers: en,
      body: options.corps ? JSON.stringify(options.corps) : undefined
    }).then(function (r) {
      if (r.status === 429 || r.status === 503) {
        // Le serveur se protege. On le dit franchement au lieu de reessayer
        // en boucle — reessayer en boucle est precisement ce qui l'a sature.
        return r.json().catch(function () { return {}; }).then(function (j) {
          var e = new Error(j.message || 'Serveur occupe');
          e.freine = true; e.attendre = j.reessayer_dans_s || 2;
          throw e;
        });
      }
      if (r.status === 401) { var e2 = new Error('Session expiree'); e2.auth = true; throw e2; }
      if (!r.ok) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          throw new Error(j.message || ('Erreur ' + r.status));
        });
      }
      return r.json();
    });
  }

  // ------------------------------------------------------------ elements
  var $ = function (id) { return document.getElementById(id); };
  var cv = $('jeu'), ctx = cv.getContext('2d');
  var ecu = $('ecu'), ectx = ecu.getContext('2d');
  var mur = $('mur'), murTxt = $('murTxt'), murActions = $('murActions');
  var bulle = $('infobulle');
  var seance = $('seance'), bilan = $('bilan');

  // --------------------------------------------------------------- etat
  var T = 34;                     // taille d'une tuile en pixels
  var COL = 40, LIG = 24;
  var carte = null;               // reponse de /api/royaume/carte
  var batParTuile = {};           // "x,y" -> batiment
  var joueur = { x: 20, y: 15, px: 20, py: 15, face: 'haut', pas: 0 };
  var touches = {};
  var mode = 'monde';             // 'monde' | 'seance'
  var proche = null;              // batiment devant lequel on se tient
  var anim = 0;                   // horloge d'animation
  var particules = [];
  var rafId = null;

  // La carte de decor est fixe : une clairiere avec un chemin en anneau.
  // Elle est generee, pas dessinee a la main, pour rester lisible quel que
  // soit le nombre de batiments.
  var DECOR = [];
  (function construireDecor() {
    for (var y = 0; y < LIG; y++) {
      var ligne = [];
      for (var x = 0; x < COL; x++) {
        var t = 'H';                                        // herbe
        if (x < 2 || y < 2 || x > COL - 3 || y > LIG - 3) t = 'A'; // arbres en bordure
        var dx = (x - 20) / 11, dy = (y - 12) / 7;
        var d = Math.sqrt(dx * dx + dy * dy);
        if (d > 0.86 && d < 1.06) t = 'C';                   // chemin en anneau
        if (Math.abs(x - 20) <= 2 && Math.abs(y - 12) <= 1) t = 'C'; // place centrale
        if (t === 'H' && ((x * 7 + y * 13) % 23 === 0) && d > 1.2) t = 'B'; // bosquets
        if (t === 'H' && ((x * 5 + y * 11) % 31 === 0) && d < 0.6) t = 'F'; // fleurs
        ligne.push(t);
      }
      DECOR.push(ligne);
    }
  })();
  var SOLIDE = { A: 1, B: 1 };

  // --------------------------------------------------- couleurs & aspect
  var NIVEAU_NOM = ['Ruine', 'Bivouac', 'Cabane', 'Tour', 'Forteresse', 'Citadelle'];
  var NIVEAU_COUL = ['#5b6472', '#8a6a3c', '#a07b45', '#5f7fb8', '#7d5bbf', '#e0a72e'];

  function estSolide(x, y) {
    if (x < 0 || y < 0 || x >= COL || y >= LIG) return true;
    if (batParTuile[x + ',' + y]) return true;
    return Boolean(SOLIDE[DECOR[y][x]]);
  }

  // ----------------------------------------------------------- chargement
  function afficherMur(titre, texte, actions) {
    mur.classList.remove('off');
    mur.querySelector('h1').textContent = titre;
    murTxt.innerHTML = texte;
    murActions.innerHTML = '';
    (actions || []).forEach(function (a) {
      var b = document.createElement('button');
      b.className = 'btn' + (a.fant ? ' fant' : '');
      b.textContent = a.texte;
      b.onclick = a.action;
      murActions.appendChild(b);
    });
  }

  // On accepte ?parcours=<id> dans l'adresse : c'est ce que passe le bouton
  // « Entrer dans le Royaume » depuis la fiche d'une offre. Sans ce
  // parametre, le serveur sert le parcours le plus recent.
  function parcoursDemande() {
    try {
      var id = new URLSearchParams(location.search).get('parcours');
      return id ? '?parcours_id=' + encodeURIComponent(id) : '';
    } catch (e) { return ''; }
  }

  function chargerCarte() {
    return api('/royaume/carte' + parcoursDemande()).then(function (c) {
      carte = c;
      batParTuile = {};
      c.batiments.forEach(function (b) {
        // Un batiment occupe 3x2 tuiles ; sa porte est la tuile du bas au centre.
        b.px = b.x; b.py = b.y;
        for (var dx = -1; dx <= 1; dx++) {
          for (var dy = -1; dy <= 0; dy++) {
            batParTuile[(b.x + dx) + ',' + (b.y + dy)] = b;
          }
        }
        b.porte = { x: b.x, y: b.y + 1 };
      });
      // On place le joueur sur la place centrale, jamais dans un mur.
      if (estSolide(joueur.x, joueur.y)) { joueur.x = c.centre.x; joueur.y = c.centre.y + 2; }
      joueur.px = joueur.x; joueur.py = joueur.y;
      majHUD();
      mur.classList.add('off');
      return c;
    });
  }

  function majHUD() {
    if (!carte) return;
    var j = carte.joueur;
    $('jSerie').querySelector('span').textContent = j.serie;
    $('jCoeurs').querySelector('span').textContent = j.coeurs;
    var pct = Math.min(100, Math.round((j.xp_du_jour / Math.max(1, j.objectif_xp)) * 100));
    $('barre').querySelector('i').style.width = pct + '%';
    // Une fois l'objectif atteint, « 733 / 50 XP » ne dit plus rien d'utile :
    // la barre est pleine et le rapport n'informe personne. On annonce ce qui
    // compte a ce moment-la — la journee est validee, la serie est assuree.
    $('barreTxt').textContent = j.xp_du_jour >= j.objectif_xp
      ? 'Objectif du jour atteint · ' + j.xp_du_jour + ' XP'
      : j.xp_du_jour + ' / ' + j.objectif_xp + ' XP';
    var dus = carte.batiments.filter(function (b) { return b.du; }).length;
    $('jRevoir').querySelector('span').textContent = dus;
    if (carte.parcours) {
      $('titreParcours').innerHTML = '<b>' + echapper(carte.parcours.titre.slice(0, 46)) + '</b>'
        + (carte.parcours.salaire ? ' · ' + echapper(carte.parcours.salaire) : '')
        + (carte.parcours.pays === 'US' ? ' 🇺🇸' : '');
    }
    dessinerEcu();
  }

  function echapper(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  // ------------------------------------------------------------ le blason
  // L'ecu se remplit d'un quartier par competence de niveau 3 ou plus.
  // C'est la recompense qui donne son nom a l'application.
  function dessinerEcu() {
    var q = (carte && carte.blason && carte.blason.quartiers) || [];
    var W = 84, H = 96;
    ectx.clearRect(0, 0, W, H);
    ectx.save();
    // Silhouette d'ecu
    ectx.beginPath();
    ectx.moveTo(6, 6); ectx.lineTo(W - 6, 6); ectx.lineTo(W - 6, H * 0.55);
    ectx.quadraticCurveTo(W - 6, H - 10, W / 2, H - 4);
    ectx.quadraticCurveTo(6, H - 10, 6, H * 0.55);
    ectx.closePath();
    ectx.fillStyle = '#232d3f'; ectx.fill();
    ectx.save(); ectx.clip();

    if (q.length) {
      // Partition en grille : 1,2,4,6,9… quartiers selon ce qui est acquis.
      var cols = q.length <= 1 ? 1 : q.length <= 4 ? 2 : 3;
      var rows = Math.ceil(q.length / cols);
      var cw = W / cols, ch = H / rows;
      q.forEach(function (quart, i) {
        var cx = (i % cols) * cw, cy = Math.floor(i / cols) * ch;
        ectx.fillStyle = quart.email;
        ectx.fillRect(cx, cy, cw + 1, ch + 1);
        ectx.fillStyle = 'rgba(255,255,255,.9)';
        ectx.font = 'bold ' + Math.min(cw, ch) * 0.52 + 'px serif';
        ectx.textAlign = 'center'; ectx.textBaseline = 'middle';
        ectx.fillText(meubleGlyphe(quart.meuble), cx + cw / 2, cy + ch / 2);
      });
    }
    ectx.restore();
    ectx.lineWidth = 3; ectx.strokeStyle = q.length >= 6 ? '#e8b64c' : '#6b7690';
    ectx.beginPath();
    ectx.moveTo(6, 6); ectx.lineTo(W - 6, 6); ectx.lineTo(W - 6, H * 0.55);
    ectx.quadraticCurveTo(W - 6, H - 10, W / 2, H - 4);
    ectx.quadraticCurveTo(6, H - 10, 6, H * 0.55);
    ectx.closePath(); ectx.stroke();
    ectx.restore();
  }

  function meubleGlyphe(m) {
    return {
      lion: '🦁', aigle: '🦅', tour: '🏰', epee: '⚔', etoile: '★', croix: '✚',
      chevron: '⌃', losange: '◆', roue: '⚙', flamme: '🔥', ancre: '⚓', cle: '🗝'
    }[m] || '◆';
  }

  // ------------------------------------------------------------ le rendu
  function redimensionner() {
    var r = cv.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.floor(r.width * dpr);
    cv.height = Math.floor(r.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
  }
  window.addEventListener('resize', redimensionner);

  function dessiner() {
    var W = cv.clientWidth, H = cv.clientHeight;
    ctx.clearRect(0, 0, W, H);

    // Camera centree sur le joueur, bornee aux limites de la carte.
    var camX = joueur.px * T - W / 2 + T / 2;
    var camY = joueur.py * T - H / 2 + T / 2;
    camX = Math.max(0, Math.min(COL * T - W, camX));
    camY = Math.max(0, Math.min(LIG * T - H, camY));
    if (COL * T < W) camX = (COL * T - W) / 2;
    if (LIG * T < H) camY = (LIG * T - H) / 2;

    ctx.save();
    ctx.translate(-Math.round(camX), -Math.round(camY));

    // --- decor
    var x0 = Math.max(0, Math.floor(camX / T) - 1), x1 = Math.min(COL, Math.ceil((camX + W) / T) + 1);
    var y0 = Math.max(0, Math.floor(camY / T) - 1), y1 = Math.min(LIG, Math.ceil((camY + H) / T) + 1);
    for (var y = y0; y < y1; y++) {
      for (var x = x0; x < x1; x++) {
        tuile(DECOR[y][x], x, y);
      }
    }

    // --- batiments (tries par y : ce qui est devant couvre ce qui est derriere)
    if (carte) {
      carte.batiments.slice().sort(function (a, b) { return a.y - b.y; })
        .forEach(function (b) { batiment(b); });
    }

    // --- joueur
    chevalier(joueur.px * T, joueur.py * T);

    // --- particules (gains d'XP dans le monde)
    particules = particules.filter(function (p) { return p.vie > 0; });
    particules.forEach(function (p) {
      p.vie -= 1; p.y -= 0.85;
      ctx.globalAlpha = Math.max(0, p.vie / p.total);
      ctx.fillStyle = p.couleur; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(p.texte, p.x, p.y);
      ctx.globalAlpha = 1;
    });

    ctx.restore();
  }

  function tuile(t, x, y) {
    var X = x * T, Y = y * T;
    var v = ((x * 31 + y * 17) % 7) - 3;   // variation stable, pas aleatoire
    if (t === 'A') {
      ctx.fillStyle = '#16321f'; ctx.fillRect(X, Y, T, T);
      ctx.fillStyle = '#1f4a2c'; rond(X + T / 2, Y + T / 2 - 2, T * 0.44);
      ctx.fillStyle = '#28603a'; rond(X + T / 2 - 3, Y + T / 2 - 5, T * 0.3);
      return;
    }
    // sol herbeux
    ctx.fillStyle = 'rgb(' + (34 + v) + ',' + (78 + v) + ',' + (46 + v) + ')';
    ctx.fillRect(X, Y, T, T);
    if (t === 'C') {
      ctx.fillStyle = 'rgb(' + (108 + v) + ',' + (94 + v) + ',' + (70 + v) + ')';
      ctx.fillRect(X, Y, T, T);
      ctx.fillStyle = 'rgba(255,255,255,.045)';
      ctx.fillRect(X + 4, Y + 5, 6, 4); ctx.fillRect(X + 17, Y + 20, 7, 5);
    } else if (t === 'B') {
      ctx.fillStyle = '#1d4429'; rond(X + T / 2, Y + T / 2, T * 0.3);
    } else if (t === 'F') {
      ctx.fillStyle = ['#e8b64c', '#e07ab0', '#8ec3f0'][(x + y) % 3];
      rond(X + T / 2, Y + T / 2, 2.6);
    }
  }

  function rond(cx, cy, r) { ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.2832); ctx.fill(); }

  // Un batiment par competence. Son aspect DIT le niveau : c'est la boucle de
  // retour visuelle la plus directe qu'on puisse offrir — on voit son travail.
  function batiment(b) {
    var X = b.x * T, Y = b.y * T;
    var n = b.niveau;
    var coul = NIVEAU_COUL[n];
    var largeur = T * 3, hauteur = T * (1.15 + n * 0.24);
    var gx = X - T * 1.5, gy = Y + T - hauteur;

    // ombre portee
    ctx.fillStyle = 'rgba(0,0,0,.32)';
    ctx.beginPath();
    ctx.ellipse(X + T / 2, Y + T * 0.95, largeur * 0.42, T * 0.24, 0, 0, 6.2832);
    ctx.fill();

    if (n === 0) {
      // Ruine : des pans de mur ecroules. Le message est clair sans texte.
      ctx.fillStyle = coul;
      ctx.fillRect(gx + 6, gy + hauteur * 0.45, T * 0.7, hauteur * 0.55);
      ctx.fillRect(gx + T * 1.35, gy + hauteur * 0.62, T * 0.6, hauteur * 0.38);
      ctx.fillRect(gx + largeur - T * 0.8, gy + hauteur * 0.5, T * 0.55, hauteur * 0.5);
      ctx.fillStyle = 'rgba(0,0,0,.28)';
      ctx.fillRect(gx + 6, gy + hauteur * 0.45, T * 0.7, 5);
    } else {
      // corps
      ctx.fillStyle = coul;
      ctx.fillRect(gx + T * 0.35, gy + T * 0.5, largeur - T * 0.7, hauteur - T * 0.5);
      // toit
      ctx.fillStyle = ombrer(coul, -34);
      ctx.beginPath();
      ctx.moveTo(gx + T * 0.12, gy + T * 0.55);
      ctx.lineTo(X + T / 2, gy - T * 0.1);
      ctx.lineTo(gx + largeur - T * 0.12, gy + T * 0.55);
      ctx.closePath(); ctx.fill();
      // porte
      ctx.fillStyle = '#2a1f14';
      ctx.fillRect(X + T * 0.22, Y + T * 0.18, T * 0.56, T * 0.82);
      // fenetres : une de plus par niveau, allumees = vivant
      for (var i = 0; i < n; i++) {
        ctx.fillStyle = '#f5d98a';
        var fx = gx + T * 0.62 + (i % 3) * T * 0.78;
        var fy = gy + T * 0.85 + Math.floor(i / 3) * T * 0.62;
        ctx.fillRect(fx, fy, T * 0.28, T * 0.3);
      }
      // creneaux a partir de forteresse
      if (n >= 4) {
        ctx.fillStyle = ombrer(coul, 18);
        for (var c = 0; c < 5; c++) {
          ctx.fillRect(gx + T * 0.35 + c * (largeur - T * 0.7) / 5, gy + T * 0.34, (largeur - T * 0.7) / 10, T * 0.3);
        }
      }
      // bannière doree a la citadelle
      if (n >= 5) {
        ctx.fillStyle = '#e8b64c';
        ctx.fillRect(X + T / 2 - 1, gy - T * 0.66, 2, T * 0.6);
        ctx.beginPath();
        ctx.moveTo(X + T / 2 + 1, gy - T * 0.62);
        ctx.lineTo(X + T / 2 + T * 0.5, gy - T * 0.48);
        ctx.lineTo(X + T / 2 + 1, gy - T * 0.34);
        ctx.closePath(); ctx.fill();
      }
    }

    // Marqueur « a revoir » : la pulsation attire l'oeil sans mot.
    if (b.du) {
      var p = 0.5 + Math.sin(anim / 16) * 0.5;
      ctx.globalAlpha = 0.55 + p * 0.45;
      ctx.fillStyle = '#e0574c';
      ctx.font = 'bold 22px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('🔁', X + T / 2, gy - T * 0.85 - p * 4);
      ctx.globalAlpha = 1;
    }

    // Pancarte : le nom de la competence, toujours lisible.
    var nom = b.skill;
    ctx.font = 'bold 12px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    var l = ctx.measureText(nom).width + 14;
    ctx.fillStyle = 'rgba(13,18,25,.86)';
    arrondi(X + T / 2 - l / 2, Y + T * 1.12, l, 19, 6);
    ctx.fillStyle = b.niveau >= 3 ? '#e8b64c' : '#c9d3e4';
    ctx.fillText(nom, X + T / 2, Y + T * 1.12 + 13.5);

    // Points de niveau sous la pancarte : le progres, chiffre, sans jauge inventee.
    for (var d = 0; d < 5; d++) {
      ctx.fillStyle = d < b.niveau ? '#e8b64c' : 'rgba(255,255,255,.16)';
      rond(X + T / 2 - 20 + d * 10, Y + T * 1.12 + 27, 3);
    }
  }

  function arrondi(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); ctx.fill();
  }

  function ombrer(hex, d) {
    var n = parseInt(hex.slice(1), 16);
    var r = Math.max(0, Math.min(255, (n >> 16) + d));
    var g = Math.max(0, Math.min(255, ((n >> 8) & 255) + d));
    var b = Math.max(0, Math.min(255, (n & 255) + d));
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  function chevalier(X, Y) {
    var bob = joueur.pas > 0 ? Math.sin(anim / 3.2) * 1.8 : 0;
    ctx.fillStyle = 'rgba(0,0,0,.3)';
    ctx.beginPath(); ctx.ellipse(X + T / 2, Y + T * 0.92, T * 0.28, T * 0.12, 0, 0, 6.2832); ctx.fill();
    // cape
    ctx.fillStyle = '#8f2f2a';
    ctx.fillRect(X + T * 0.26, Y + T * 0.34 + bob, T * 0.48, T * 0.42);
    // corps
    ctx.fillStyle = '#c9ced8';
    ctx.fillRect(X + T * 0.3, Y + T * 0.38 + bob, T * 0.4, T * 0.34);
    // tete
    ctx.fillStyle = '#e8c9a0';
    ctx.fillRect(X + T * 0.33, Y + T * 0.18 + bob, T * 0.34, T * 0.24);
    // heaume
    ctx.fillStyle = '#e8b64c';
    ctx.fillRect(X + T * 0.31, Y + T * 0.14 + bob, T * 0.38, T * 0.12);
    // visiere selon l'orientation
    ctx.fillStyle = '#2a3140';
    if (joueur.face === 'bas') ctx.fillRect(X + T * 0.37, Y + T * 0.28 + bob, T * 0.26, T * 0.05);
    else if (joueur.face === 'gauche') ctx.fillRect(X + T * 0.33, Y + T * 0.27 + bob, T * 0.14, T * 0.06);
    else if (joueur.face === 'droite') ctx.fillRect(X + T * 0.53, Y + T * 0.27 + bob, T * 0.14, T * 0.06);
    // jambes
    ctx.fillStyle = '#3d4657';
    var e = joueur.pas > 0 ? Math.sin(anim / 3.2) * 2.4 : 0;
    ctx.fillRect(X + T * 0.34, Y + T * 0.72 + bob, T * 0.11, T * 0.2 + e);
    ctx.fillRect(X + T * 0.55, Y + T * 0.72 + bob, T * 0.11, T * 0.2 - e);
  }

  // ------------------------------------------------------- deplacement
  function tenter(dx, dy, face) {
    joueur.face = face;
    if (joueur.pas > 0) return;
    var nx = joueur.x + dx, ny = joueur.y + dy;
    if (estSolide(nx, ny)) return;
    joueur.x = nx; joueur.y = ny; joueur.pas = 1;
  }

  function boucle() {
    anim++;
    // interpolation du deplacement : rien de reseau ici, c'est le point.
    if (joueur.pas > 0) {
      var vx = joueur.x - joueur.px, vy = joueur.y - joueur.py;
      var d = Math.abs(vx) + Math.abs(vy);
      if (d < 0.06) { joueur.px = joueur.x; joueur.py = joueur.y; joueur.pas = 0; }
      else { joueur.px += vx * 0.24; joueur.py += vy * 0.24; }
    } else if (mode === 'monde') {
      if (touches.haut) tenter(0, -1, 'haut');
      else if (touches.bas) tenter(0, 1, 'bas');
      else if (touches.gauche) tenter(-1, 0, 'gauche');
      else if (touches.droite) tenter(1, 0, 'droite');
    }

    // Batiment devant lequel on se tient : sa porte, ou une tuile adjacente.
    var avant = proche;
    proche = null;
    if (carte && mode === 'monde') {
      for (var i = 0; i < carte.batiments.length; i++) {
        var b = carte.batiments[i];
        var dx = Math.abs(joueur.x - b.porte.x), dy = joueur.y - b.porte.y;
        if (dx <= 1 && dy >= 0 && dy <= 1) { proche = b; break; }
      }
    }
    if (proche !== avant) majBulle();

    dessiner();
    rafId = requestAnimationFrame(boucle);
  }

  // L'animation s'arrete quand l'onglet est cache : pas de CPU brule pour
  // rien, et surtout aucune requete de fond. Un onglet oublie ne coute rien.
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { if (rafId) cancelAnimationFrame(rafId); rafId = null; }
    else if (!rafId) rafId = requestAnimationFrame(boucle);
  });

  function majBulle() {
    if (!proche) { bulle.classList.remove('on'); return; }
    var b = proche;
    var etat = NIVEAU_NOM[b.niveau];
    var txt = '<b>' + echapper(b.skill) + '</b> — ' + etat + ' (niveau ' + b.niveau + '/5)';
    if (b.du) txt += ' · <span style="color:#e0574c">à revoir</span>';
    if (!b.couvert) txt += ' · <span style="color:#9aa7bd">fiche générique</span>';
    txt += '<br>' + b.reussites + ' réussite' + (b.reussites > 1 ? 's' : '')
      + ' · ' + b.echecs + ' échec' + (b.echecs > 1 ? 's' : '')
      + ' · ' + b.nb_exercices + ' exercices';
    txt += '<br><kbd>Entrée</kbd> ou <kbd>Espace</kbd> pour entrer';
    bulle.innerHTML = txt;
    bulle.classList.add('on');
  }

  // --------------------------------------------------------- les touches
  var MAP = {
    ArrowUp: 'haut', ArrowDown: 'bas', ArrowLeft: 'gauche', ArrowRight: 'droite',
    z: 'haut', s: 'bas', q: 'gauche', d: 'droite',
    w: 'haut', a: 'gauche'
  };
  document.addEventListener('keydown', function (e) {
    if (mode === 'seance') {
      // Raccourcis de séance : 1-9 pour choisir, Entrée pour valider.
      if (e.key === 'Enter') { e.preventDefault(); $('sValider').click(); }
      else if (/^[1-9]$/.test(e.key)) {
        var els = $('sZone').querySelectorAll('.choix,.critere');
        var el = els[Number(e.key) - 1];
        if (el && !el.disabled) { e.preventDefault(); el.click(); }
      }
      return;
    }
    var d = MAP[e.key] || MAP[e.key.toLowerCase()];
    if (d) { touches[d] = true; e.preventDefault(); }
    if ((e.key === 'Enter' || e.key === ' ') && proche) { e.preventDefault(); ouvrirSeance(proche); }
  });
  document.addEventListener('keyup', function (e) {
    var d = MAP[e.key] || MAP[e.key.toLowerCase()];
    if (d) { touches[d] = false; e.preventDefault(); }
  });

  // croix directionnelle tactile
  Array.prototype.forEach.call(document.querySelectorAll('#croix button'), function (b) {
    var d = b.dataset.d;
    var on = function (e) {
      e.preventDefault();
      if (d === 'action') { if (proche) ouvrirSeance(proche); return; }
      touches[d] = true;
    };
    var off = function (e) { e.preventDefault(); touches[d] = false; };
    b.addEventListener('touchstart', on, { passive: false });
    b.addEventListener('touchend', off, { passive: false });
    b.addEventListener('mousedown', on);
    b.addEventListener('mouseup', off);
    b.addEventListener('mouseleave', off);
  });

  // ============================================================== SEANCE
  var S = { liste: [], i: 0, ex: null, rep: null, corrige: false, justes: 0, xp: 0, skill: '' };

  // Bascule entre le message (attente, séance vide) et le corps d'un exercice.
  // On MASQUE, on ne détruit pas : les éléments de l'exercice doivent survivre
  // à une séance vide, sinon la séance suivante s'ouvre sur un écran mort.
  function afficherMessage(html) {
    var m = $('sMessage');
    if (html === null) {
      m.hidden = true;
      ['sEtiq', 'sQuestion', 'sZone'].forEach(function (id) { $(id).hidden = false; });
      return;
    }
    m.innerHTML = html;
    m.hidden = false;
    ['sEtiq', 'sSituation', 'sQuestion', 'sZone', 'pourquoi', 'grilleRep']
      .forEach(function (id) { $(id).hidden = true; });
  }

  function ouvrirSeance(b) {
    mode = 'seance';
    S = { liste: [], i: 0, ex: null, rep: null, corrige: false, justes: 0, xp: 0, skill: b.skill };
    seance.classList.add('on');
    $('sBarre').querySelector('i').style.width = '0%';
    $('verdict').textContent = '';
    afficherMessage('<span style="color:#9aa7bd">Préparation de la séance…</span>');
    $('sValider').disabled = true;
    api('/seance?skill=' + encodeURIComponent(b.skill) + '&taille=7').then(function (r) {
      if (!r.exercices.length) {
        afficherMessage('Rien à réviser ici pour le moment — tous les exercices de <b>'
          + echapper(b.skill) + '</b> sont réussis et pas encore dus. '
          + 'La répétition espacée les ramènera d\'elle-même, au moment où l\'oubli commence.'
          + '<br><br><span style="color:#9aa7bd">Va voir un bâtiment en ruine : c\'est là qu\'il '
          + 'reste du travail.</span>');
        $('sValider').textContent = 'Fermer';
        $('sValider').disabled = false;
        $('sValider').onclick = fermerSeance;
        return;
      }
      S.liste = r.exercices;
      $('sCoeurs').querySelector('span').textContent = r.coeurs;
      $('sValider').onclick = onValider;
      $('sValider').textContent = 'Valider';
      montrer();
    }).catch(erreur);
  }

  function fermerSeance() {
    mode = 'monde';
    seance.classList.remove('on');
    bilan.classList.remove('on');
    // On ne recharge la carte QU'ICI : une fois par séance, pas par image.
    chargerCarte().catch(erreur);
  }
  $('sQuitter').onclick = function () {
    if (S.i > 0) finir(); else fermerSeance();
  };
  $('bilanOk').onclick = fermerSeance;

  function montrer() {
    var ex = S.liste[S.i];
    S.ex = ex; S.rep = null; S.corrige = false;
    afficherMessage(null);          // on rend la main aux éléments de l'exercice
    $('sBarre').querySelector('i').style.width = Math.round((S.i / S.liste.length) * 100) + '%';
    $('pourquoi').hidden = true;
    $('grilleRep').hidden = true;
    $('verdict').textContent = '';
    $('verdict').className = '';
    $('sValider').textContent = 'Valider';
    $('sValider').disabled = true;

    var etiq = $('sEtiq');
    var noms = {
      qcm: 'Rappel', chiffre: 'Ordre de grandeur', arbitrage: 'Arbitrage',
      design: 'System design', star: 'Comportemental (STAR)'
    };
    etiq.textContent = noms[ex.type] + ' · ' + ex.skill;
    etiq.className = 'etiq' + (ex.type === 'design' || ex.type === 'star' ? ' g' : ex.type === 'arbitrage' ? ' v' : '');

    var sit = $('sSituation');
    if (ex.situation) { sit.textContent = ex.situation; sit.hidden = false; }
    else { sit.hidden = true; }

    $('sQuestion').textContent = ex.question || ex.enonce
      || (ex.situation ? 'Quelle option recommandes-tu ?' : '');
    if (ex.situation && !ex.question && !ex.enonce) $('sQuestion').textContent = 'Quelle option recommandes-tu, et pourquoi ?';

    var zone = $('sZone');
    zone.innerHTML = '';

    if (ex.type === 'qcm' || ex.type === 'arbitrage') {
      (ex.choix || ex.options).forEach(function (c, i) {
        var b = document.createElement('button');
        b.className = 'choix'; b.type = 'button';
        b.innerHTML = '<b style="color:#7d8ba4;margin-right:9px">' + (i + 1) + '</b>' + echapper(c);
        b.onclick = function () {
          if (S.corrige) return;
          Array.prototype.forEach.call(zone.children, function (o) { o.classList.remove('sel'); });
          b.classList.add('sel'); S.rep = i; $('sValider').disabled = false;
        };
        zone.appendChild(b);
      });
    } else if (ex.type === 'chiffre') {
      var wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;align-items:center;gap:12px;flex-wrap:wrap';
      var inp = document.createElement('input');
      inp.type = 'text'; inp.inputMode = 'decimal'; inp.id = 'sNombre';
      inp.placeholder = '?';
      inp.oninput = function () {
        S.rep = inp.value;
        $('sValider').disabled = !inp.value.trim();
      };
      var u = document.createElement('span');
      u.style.cssText = 'color:#9aa7bd;font-size:15px'; u.textContent = ex.unite || '';
      wrap.appendChild(inp); wrap.appendChild(u);
      zone.appendChild(wrap);
      setTimeout(function () { inp.focus(); }, 60);
    } else {
      // design / star : on repond D'ABORD dans sa tete (ou a l'oral), puis on
      // decouvre la grille et on coche honnetement. La grille n'est jamais
      // montree avant : sinon on recopie au lieu de reflechir.
      var note = document.createElement('p');
      note.style.cssText = 'color:#9aa7bd;font-size:14.5px;line-height:1.6;margin-bottom:16px';
      note.innerHTML = '<b style="color:#e8b64c">Réponds à voix haute, comme en entretien.</b> '
        + 'Prends le temps qu\'il faut. Puis découvre la grille du jury et coche, honnêtement, '
        + 'ce que tu as réellement dit. Il y a <b>' + ex.nb_criteres + ' critères</b>.';
      zone.appendChild(note);
      var b2 = document.createElement('button');
      b2.className = 'btn'; b2.type = 'button'; b2.textContent = "J'ai répondu — montrer la grille";
      b2.onclick = function () { montrerGrille(ex, zone, b2, note); };
      zone.appendChild(b2);
      $('sValider').disabled = true;
    }
  }

  function montrerGrille(ex, zone, bouton, note) {
    bouton.remove(); note.remove();
    S.rep = [];
    var titre = document.createElement('p');
    titre.style.cssText = 'font-weight:800;margin-bottom:12px;color:#e8b64c;font-size:13px;letter-spacing:1px;text-transform:uppercase';
    titre.textContent = 'La grille du jury — coche ce que tu as dit';
    zone.appendChild(titre);
    // On demande la grille au serveur en meme temps que la correction :
    // ici on affiche des cases numerotees, le libelle arrive avec le verdict.
    // Pour rester utile hors ligne, on affiche des cases generiques.
    for (var i = 0; i < ex.nb_criteres; i++) {
      (function (idx) {
        var d = document.createElement('div');
        d.className = 'critere';
        d.innerHTML = '<span class="case"></span><span>Critère ' + (idx + 1) + '</span>';
        d.onclick = function () {
          if (S.corrige) return;
          d.classList.toggle('coche');
          S.rep[idx] = d.classList.contains('coche');
          d.querySelector('.case').textContent = d.classList.contains('coche') ? '✓' : '';
          $('sValider').disabled = false;
        };
        zone.appendChild(d);
      })(i);
    }
    var aide = document.createElement('p');
    aide.style.cssText = 'color:#7d8ba4;font-size:13px;margin-top:12px;line-height:1.55';
    aide.textContent = "Le détail de chaque critère s'affiche après validation : la grille sert à "
      + "te corriger, pas à te souffler la réponse.";
    zone.appendChild(aide);
    $('sValider').disabled = false;
  }

  function onValider() {
    if (S.corrige) { suivant(); return; }
    if (S.rep === null) return;
    $('sValider').disabled = true;
    api('/seance/reponse', {
      methode: 'POST',
      corps: { exercice_id: S.ex.id, reponse: S.rep }
    }).then(function (r) {
      S.corrige = true;
      if (r.correct) S.justes++;
      S.xp += r.xp;
      afficherVerdict(r);
      $('sCoeurs').querySelector('span').textContent = r.coeurs;
      if (carte) {
        carte.joueur.coeurs = r.coeurs;
        carte.joueur.serie = r.serie;
        carte.joueur.xp_du_jour = r.xp_du_jour;
        majHUD();
      }
      $('sValider').textContent = S.i + 1 >= S.liste.length ? 'Terminer' : 'Continuer';
      $('sValider').disabled = false;
    }).catch(function (e) {
      $('sValider').disabled = false;
      erreur(e);
    });
  }

  function afficherVerdict(r) {
    // Verrouiller les choix et colorer
    var zone = $('sZone');
    var els = zone.querySelectorAll('.choix');
    Array.prototype.forEach.call(els, function (el, i) {
      el.disabled = true;
      el.classList.remove('sel');
      if (i === r.attendu) el.classList.add('ok');
      else if (i === S.rep && !r.correct) el.classList.add('ko');
    });
    Array.prototype.forEach.call(zone.querySelectorAll('.critere'), function (el) {
      el.style.pointerEvents = 'none';
    });
    var inp = $('sNombre');
    if (inp) { inp.disabled = true; inp.style.borderColor = r.correct ? '#3fbf6a' : '#e0574c'; }

    var v = $('verdict');
    v.className = r.correct ? 'ok' : 'ko';
    var t = '';
    if (S.ex.type === 'design' || S.ex.type === 'star') {
      t = '<b>' + (r.correct ? 'Passé' : 'Sous le seuil') + '</b>'
        + r.coches + ' / ' + r.total + ' critères — le jury en attend ' + r.attendu + '.';
    } else if (r.correct) {
      t = '<b>Juste</b>' + (r.combo > 1 ? 'Enchaînement ×' + r.combo : 'Bien vu.');
    } else {
      t = '<b>Faux</b>'
        + (S.ex.type === 'chiffre'
          ? 'La réponse attendue : ' + r.attendu + ' ' + (S.ex.unite || '')
            + (r.note > 0 ? ' — ton ordre de grandeur était proche, tu marques quand même.' : '')
          : 'La bonne réponse est surlignée en vert.');
    }
    v.innerHTML = t;

    // Le « pourquoi » : c'est lui qui enseigne. Une correction sans explication
    // n'apprend rien, elle ne fait que sanctionner.
    if (r.pourquoi) {
      $('pourquoiTxt').textContent = r.pourquoi;
      $('pourquoi').hidden = false;
      // On amene le « pourquoi » sous les yeux. C'est lui qui enseigne :
      // le laisser sous la ligne de flottaison, a charge de l'utilisateur de
      // faire defiler, revient a ne pas l'afficher du tout.
      setTimeout(function () {
        try { $('pourquoi').scrollIntoView({ behavior: 'smooth', block: 'center' }); }
        catch (e) { $('sCorps').scrollTop = $('sCorps').scrollHeight; }
      }, 260);
    }
    // Le detail de la grille, une fois la note posee.
    if (r.grille && r.grille.length) {
      var g = $('grilleRep');
      g.innerHTML = '<h4 style="font-size:11px;letter-spacing:1.2px;text-transform:uppercase;color:#e8b64c;margin-bottom:8px">Ce que le jury cochait</h4><ol>'
        + r.grille.map(function (c) { return '<li>' + echapper(c) + '</li>'; }).join('') + '</ol>';
      g.hidden = false;
    }

    if (r.xp > 0) gain('+' + r.xp + ' XP');
    if (r.serie_gagnee) setTimeout(function () { gain('🔥 Série ' + r.serie); }, 700);
    if (r.quartier_gagne) {
      setTimeout(function () { gain('🛡️ Quartier gagné'); }, 1250);
    }
  }

  function gain(txt) {
    var d = document.createElement('div');
    d.className = 'gain'; d.textContent = txt;
    seance.appendChild(d);
    setTimeout(function () { d.remove(); }, 1100);
  }

  function suivant() {
    S.i++;
    if (S.i >= S.liste.length) { finir(); return; }
    montrer();
    $('sCorps').scrollTop = 0;
  }

  function finir() {
    $('sBarre').querySelector('i').style.width = '100%';
    var n = S.i + (S.corrige ? 1 : 0);
    var pct = n ? Math.round((S.justes / n) * 100) : 0;
    $('bilanTitre').textContent = pct >= 80 ? 'Belle séance' : pct >= 50 ? 'Séance terminée' : 'À reprendre';
    $('bilanStat').innerHTML =
      '<div><b>' + S.justes + '/' + n + '</b>réussis</div>' +
      '<div><b>+' + S.xp + '</b>XP</div>' +
      '<div><b>' + (carte ? carte.joueur.serie : 0) + '</b>jours de série</div>';
    var mots = pct >= 80
      ? 'Ces exercices reviendront plus tard, quand l\'oubli commence — c\'est la répétition espacée qui fait la différence trois semaines après, le jour de l\'entretien.'
      : pct >= 50
        ? 'Les exercices ratés reviendront dès demain. C\'est voulu : on ne progresse que sur ce qu\'on a manqué.'
        : 'Rien d\'inquiétant. Relis les « pourquoi » : ce sont eux qui portent le contenu, pas les bonnes réponses.';
    $('bilanMot').textContent = mots;
    bilan.classList.add('on');
  }

  // ------------------------------------------------------------- erreurs
  function erreur(e) {
    if (e && e.auth) {
      afficherMur('Session expirée', 'Reconnecte-toi sur Blason, puis reviens au Royaume.',
        [{ texte: 'Aller à la connexion', action: function () { location.href = '/'; } }]);
      return;
    }
    if (e && e.freine) {
      // Le serveur nous freine : on le DIT, on ne réessaie pas en boucle.
      afficherMur('Le serveur souffle', e.message
        + '<br><br>Le Royaume ne relance pas la requête tout seul : réessayer en boucle est '
        + 'exactement ce qui sature un serveur.',
        [{ texte: 'Réessayer', action: function () { mur.classList.add('off'); chargerCarte().catch(erreur); } }]);
      return;
    }
    afficherMur('Grain de sable', echapper((e && e.message) || 'Erreur inconnue'),
      [{ texte: 'Réessayer', action: function () { mur.classList.add('off'); chargerCarte().catch(erreur); } }]);
  }

  // ------------------------------------------------------------ démarrage
  redimensionner();
  if (!jeton) {
    afficherMur('Le Royaume',
      'Connecte-toi d\'abord sur Blason : le Royaume utilise la même session.',
      [{ texte: 'Aller à la connexion', action: function () { location.href = '/'; } }]);
    return;
  }
  chargerCarte().then(function (c) {
    if (!c.parcours) {
      afficherMur('Aucun parcours',
        'Le Royaume se construit à partir d\'une offre d\'emploi : chaque compétence exigée devient '
        + 'un bâtiment. Colle une offre dans Blason, génère un parcours, puis reviens.',
        [{ texte: 'Aller à Blason', action: function () { location.href = '/'; } }]);
      return;
    }
    rafId = requestAnimationFrame(boucle);
  }).catch(erreur);
})();
