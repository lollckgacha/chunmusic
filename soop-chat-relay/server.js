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
    console.error(`[${streamerId}] Firebase 전송 실패:`, e.message);
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
  // 재연결은 일부러 안 한다 - 프로그램을 켤 때 그 순간 방송 중인 스트리머만 확인하고,
  // 이후에 끊기거나 새로 방송을 시작한 스트리머는 사용자가 직접 다시 실행해서 잡는 방식.
  chat.on('error', (err) => {
    console.error(`[${streamerId}] 채팅 연결 오류:`, err && err.message ? err.message : err);
  });
  chat.on('close', () => {
    console.warn(`[${streamerId}] 연결이 끊겼습니다. (자동 재연결 안 함 - 다시 잡으려면 서버를 재시작하세요)`);
  });

  chat.connect()
    .then(() => {
      console.log(`✅ [${streamerId}] (bjId=${bjId}) 채팅 연결 성공`);
    })
    .catch((err) => {
      console.error(`⚠️ [${streamerId}] 연결 실패 (방송 중이 아니거나 bjId가 틀렸을 수 있음):`, err.message);
    });
}

console.log('SOOP 채팅 릴레이 서버 시작 - 실행 시점에 방송 중인 채널만 연결을 시도합니다 (이후 자동 재시도 없음)...');
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
