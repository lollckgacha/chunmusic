// 천타버스 노래 맞히기 - SOOP 실시간 채팅 릴레이 서버
//
// SOOP(구 아프리카TV)은 공식 Chat SDK가 있지만 (1) 확장 프로그램 심사 절차가 있어 승인까지 시간이
// 걸리고, (2) 문서상 "현재는 본인 방송에만 접속 가능"이라 12명 각자의 로그인이 필요한 구조다.
// 그래서 커뮤니티가 리버스엔지니어링한 비공식 라이브러리(soop-extension, npm)를 사용해서
// 로그인 없이 읽기 전용으로 채팅을 받아온다.
//
// ⚠️ 검증 안내: 이 코드는 개발 환경에 실제 SOOP 방송에 접속할 방법이 없어 라이브로 테스트하지
// 못했다. soop-extension 라이브러리의 README 예제를 기준으로 작성했지만, 실제 배포 후 반드시
// 방송 중인 스트리머로 직접 확인해봐야 한다. 콘솔 로그에 연결 성공/실패가 찍히니 그걸로 확인할 것.
//
// 동작 방식: 12개 채널에 상시 연결해두고, 채팅이 오면 정규화해서 Firebase RTDB의
// chat_relay/{streamerId}/messages 경로에 push한다. chunmusic/index.html의
// FirebaseRelayChatSource가 바로 이 경로를 구독하도록 이미 만들어져 있다.

import 'dotenv/config'; // .env 파일을 process.env로 읽어들임 (이게 없으면 .env를 만들어도 Node가 무시함)

// Render 같은 컨테이너 호스팅에서 Node의 내장 fetch가 Firebase 쪽으로 "fetch failed"만 던지고
// 실패하는 경우가 있다 - 컨테이너 네트워크가 IPv6 주소로 먼저 연결을 시도하다 막히는 흔한 문제.
// DNS 조회 순서를 IPv4 우선으로 강제해서 우회한다. (로컬 PC에서는 원래도 잘 되던 것과 대비됨)
import dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');

import { SoopChatEvent, SoopClient } from 'soop-extension';

const FIREBASE_URL = (process.env.FIREBASE_URL || 'https://dongpa2026-2fda5-default-rtdb.asia-southeast1.firebasedatabase.app').replace(/\/$/, '');
const FIREBASE_SECRET = process.env.FIREBASE_SECRET;

if (!FIREBASE_SECRET) {
  console.error('❌ FIREBASE_SECRET 환경변수가 없습니다. .env.example을 참고해서 .env를 만들거나 배포 환경변수에 설정하세요.');
  process.exit(1);
}

// chunmusic/index.html 의 STREAMERS 배열과 반드시 동일하게 맞출 것 (streamerId -> SOOP bjId)
const STREAMER_BJ_IDS = {
  chunyang: '243000',
  madaom: 'madaomm',
  nanamoon: 'nanamoon777',
  imhaming: 'imha22',
  moonmomo: 'doormomo',
  chebi: 'chebi2',
  kapu: 'kappuchan',
  kyaang: 'kyaang123',
  kimwello: 'wellro314',
  moca: 'mocamu2',
  dalta: 'dalta20',
  plli: 'plincess',
};

const RECONNECT_INTERVAL_MS = 10 * 60 * 1000; // 10분마다 재시도

async function pushChatMessage(streamerId, entry) {
  const url = `${FIREBASE_URL}/chat_relay/${streamerId}/messages.json?auth=${FIREBASE_SECRET}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    });
    if (!res.ok) {
      console.error(`[${streamerId}] Firebase 응답 오류: ${res.status} ${await res.text()}`);
    }
  } catch (e) {
    // e.cause에 실제 네트워크 에러(ENOTFOUND, ECONNREFUSED 등)가 들어있는 경우가 많아서 같이 찍는다.
    console.error(`[${streamerId}] Firebase 전송 실패:`, e.message, e.cause || '');
  }
}

function connectStreamerChat(streamerId, bjId) {
  const client = new SoopClient();
  const chat = client.chat({ streamerId: bjId }); // login을 안 넘기면 읽기 전용으로 연결됨

  chat.on(SoopChatEvent.CHAT, (response) => {
    pushChatMessage(streamerId, {
      userId: response.userId,
      nickname: response.username,
      text: response.comment,
      ts: Date.now(),
    });
  });

  // ⚠️ 아래 error/close 이벤트명은 soop-extension 실제 구현과 다를 수 있다 (문서로 직접
  // 확인 못 함). 콘솔에 예상과 다른 로그가 뜨면 이 부분부터 의심할 것.
  // Render처럼 사람이 계속 지켜보지 않는 상시구동 서버에서는 연결이 끊기거나 방송 시작 시점을
  // 놓치면 그대로 방치되므로, 10분 간격으로 재시도해서 스스로 복구되게 한다.
  chat.on('error', (err) => {
    console.error(`[${streamerId}] 채팅 연결 오류:`, err && err.message ? err.message : err);
  });
  chat.on('close', () => {
    console.warn(`[${streamerId}] 연결이 끊겼습니다. ${RECONNECT_INTERVAL_MS / 60000}분 후 재연결 시도`);
    setTimeout(() => connectStreamerChat(streamerId, bjId), RECONNECT_INTERVAL_MS);
  });

  chat.connect()
    .then(() => {
      console.log(`✅ [${streamerId}] (bjId=${bjId}) 채팅 연결 성공`);
    })
    .catch((err) => {
      console.error(`⚠️ [${streamerId}] 연결 실패 (방송 중이 아니거나 bjId가 틀렸을 수 있음):`, err.message);
      setTimeout(() => connectStreamerChat(streamerId, bjId), RECONNECT_INTERVAL_MS);
    });
}

console.log(`SOOP 채팅 릴레이 서버 시작 - 12개 채널에 연결을 시도합니다 (실패/끊김 시 ${RECONNECT_INTERVAL_MS / 60000}분마다 재시도)...`);
for (const [streamerId, bjId] of Object.entries(STREAMER_BJ_IDS)) {
  connectStreamerChat(streamerId, bjId);
}

// Render 같은 "Web Service"는 포트를 열어야 정상 배포로 인식하고, 외부에서 주기적으로
// 이 주소를 핑 해줘야 무료 티어의 "비활성 슬립"에 안 걸린다 (README의 "잠들지 않게 하기" 참고).
import http from 'node:http';
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('천타버스 SOOP 채팅 릴레이 서버 - 정상 동작 중\n');
}).listen(PORT, () => {
  console.log(`헬스체크용 HTTP 서버 ${PORT}번 포트에서 대기 중`);
});
