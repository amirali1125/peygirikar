<?php
// «هماهنگی مهر هشتم»: the small server that keeps tasks, chat, letters and ideas for the three, so they reach each
// other even when only one person is online. One endpoint, POST with a JSON body:
//   { a: 'ping' }                         → { ok: true }
//   { a: 'login', user, code }            → { ok, token, exp }   (code checked against the same PBKDF2 hashes as app.js)
//   { a: 'sync', token, db }              → { ok, db }           (db: { ideas|tasks|msgs|letters: { id: item } })
// Merging: for each item the copy with the larger v (time of its last change) wins, the same rule the pages use.
// Data and the signing key live in data/, which data/.htaccess closes to the web. PHP 7.2 or newer.
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

// The code hashes live in config.php beside this file (not in the repository; see config.example.php).
$USERS = @include __DIR__ . '/config.php';
if (!is_array($USERS) || count($USERS) !== 3) { http_response_code(500); echo '{"ok":false,"error":"config.php missing"}'; exit; }
define('USERS', $USERS);
const COLS = ['ideas', 'tasks', 'msgs', 'letters'];
const MAX_BODY = 3000000;      // bytes per request
const MAX_ITEM = 20000;        // bytes per item
const TOKEN_DAYS = 30;
$DIR = __DIR__ . '/data';

function out($x, $code = 200) { http_response_code($code); echo json_encode($x, JSON_UNESCAPED_UNICODE); exit; }
function fail($msg, $code = 400) { out(['ok' => false, 'error' => $msg], $code); }

if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail('POST only', 405);
$raw = file_get_contents('php://input', false, null, 0, MAX_BODY + 1);
if ($raw === false || strlen($raw) > MAX_BODY) fail('too large', 413);
$in = json_decode($raw, true);
if (!is_array($in)) fail('bad json');

if (!is_dir($DIR)) { @mkdir($DIR, 0700, true); }
if (!file_exists("$DIR/.htaccess")) @file_put_contents("$DIR/.htaccess", "Require all denied\n<IfModule !mod_authz_core.c>\nDeny from all\n</IfModule>\n");
if (!file_exists("$DIR/index.html")) @file_put_contents("$DIR/index.html", '');
function secret() {
  global $DIR; $f = "$DIR/secret.key";
  if (!file_exists($f)) { @file_put_contents($f, bin2hex(random_bytes(32)), LOCK_EX); @chmod($f, 0600); }
  $s = @file_get_contents($f); if (!$s || strlen($s) < 64) fail('server storage is not writable', 500);
  return $s;
}
function b64u($s) { return rtrim(strtr(base64_encode($s), '+/', '-_'), '='); }
function token($user, $exp) { $p = "$user|$exp"; return b64u($p) . '.' . hash_hmac('sha256', $p, secret()); }
function who($tok) {
  if (!is_string($tok) || substr_count($tok, '.') !== 1) return null;
  [$p64, $sig] = explode('.', $tok);
  $p = base64_decode(strtr($p64, '-_', '+/'), true); if ($p === false || substr_count($p, '|') !== 1) return null;
  if (!hash_equals(hash_hmac('sha256', $p, secret()), $sig)) return null;
  [$user, $exp] = explode('|', $p);
  return isset(USERS[$user]) && (int)$exp > time() ? $user : null;
}

$a = $in['a'] ?? '';
if ($a === 'ping') out(['ok' => true]);

if ($a === 'login') {
  $user = $in['user'] ?? ''; $code = (string)($in['code'] ?? '');
  // A short pause on every attempt slows guessing; the check itself is constant-time.
  usleep(400000);
  if (!isset(USERS[$user]) || $code === '' || strlen($code) > 40) fail('wrong', 401);
  $h = hash_pbkdf2('sha256', $code, "mehr8-hmg|$user", 200000, 64);
  if (!hash_equals(USERS[$user], $h)) fail('wrong', 401);
  $exp = time() + TOKEN_DAYS * 86400;
  out(['ok' => true, 'token' => token($user, $exp), 'exp' => $exp]);
}

if ($a === 'sync') {
  $user = who($in['token'] ?? null); if (!$user) fail('signin', 401);
  $f = "$DIR/db.json";
  $fh = @fopen($f, 'c+'); if (!$fh) fail('server storage is not writable', 500);
  flock($fh, LOCK_EX);
  $cur = json_decode(stream_get_contents($fh) ?: '{}', true); if (!is_array($cur)) $cur = [];
  foreach (COLS as $c) if (!isset($cur[$c]) || !is_array($cur[$c])) $cur[$c] = [];
  $ch = false; $now = (time() + 300) * 1000;   // an item may not claim a time more than 5 minutes ahead
  $db = $in['db'] ?? [];
  if (is_array($db)) foreach (COLS as $c) {
    if (!isset($db[$c]) || !is_array($db[$c])) continue;
    foreach ($db[$c] as $id => $it) {
      if (!is_string($id) || strlen($id) > 80 || !is_array($it) || ($it['id'] ?? null) !== $id) continue;
      $v = $it['v'] ?? null; if (!is_int($v) && !is_float($v)) continue;
      if ($v > $now) $it['v'] = $v = $now;
      if (strlen(json_encode($it, JSON_UNESCAPED_UNICODE)) > MAX_ITEM) continue;
      if (!isset($cur[$c][$id]) || $v > ($cur[$c][$id]['v'] ?? 0)) { $cur[$c][$id] = $it; $ch = true; }
    }
  }
  if ($ch) { ftruncate($fh, 0); rewind($fh); fwrite($fh, json_encode($cur, JSON_UNESCAPED_UNICODE)); fflush($fh); }
  flock($fh, LOCK_UN); fclose($fh);
  foreach (COLS as $c) if (!$cur[$c]) $cur[$c] = new stdClass();   // {} not [] in JSON
  out(['ok' => true, 'db' => $cur, 'user' => $user]);
}

fail('unknown action');
