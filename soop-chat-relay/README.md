# 천타버스 노래 맞히기 - SOOP 채팅 릴레이 서버

`chunmusic` 게임의 스트리밍 모드는 시청자가 SOOP(구 아프리카TV) 채팅에 `!정답`을 쳐야 판정이 됩니다.
브라우저에서 SOOP 채팅 서버에 직접 접속할 수 없어서, 이 릴레이 서버가 대신 접속해 채팅을
받아온 뒤 Firebase Realtime Database(`chat_relay/{streamerId}/messages`)로 넘겨주고,
게임 페이지는 그 경로를 구독합니다.

## ⚠️ 아직 라이브로 검증되지 않았습니다

이 코드는 SOOP 공식 API가 아니라 커뮤니티가 리버스엔지니어링한 비공식 라이브러리
(`soop-extension`, npm)를 씁니다. 개발 중에는 실제 SOOP 방송에 접속해 테스트할 방법이
없어서, 라이브러리 README의 예제 코드를 기준으로만 작성했습니다.

**배포 후 반드시 실제로 방송 중인 스트리머 한 명으로 테스트**해보고, 콘솔에 아래처럼
연결 성공 로그가 뜨는지 확인해주세요.

```
✅ [chunyang] (bjId=243000) 채팅 연결 성공
```

`⚠️` 로 시작하는 실패 로그가 뜨거나 채팅이 안 들어오면, 그 로그 내용을 그대로 알려주시면
고치겠습니다. SOOP이 프로토콜을 바꾸면 이 라이브러리 자체가 통째로 안 될 수도 있습니다.

## 사용법

```bash
npm install
cp .env.example .env
# .env 파일 열어서 FIREBASE_SECRET 채우기 (apps-script-songlist.gs.txt 와 동일한 값)
npm start
```

## 배포

이 서버는 채팅을 실시간으로 계속 받아야 하므로 **상시 구동되는 서버**에 올려야 합니다
(Vercel/Netlify 같은 서버리스/함수형 호스팅은 맞지 않습니다). Render, Railway, Fly.io 같은
곳에 "Node.js 서비스"로 배포하고, 환경변수에 `FIREBASE_SECRET`(과 필요하면 `FIREBASE_URL`)을
설정하면 됩니다.

### 잠들지 않게 하기 (무료 티어 필수)

이 서버는 SOOP 웹소켓만 물고 있고 외부에서 HTTP 요청을 받을 일이 거의 없는 구조라,
Render 같은 무료 "Web Service"는 "비활성"으로 판단해서 슬립시킬 수 있습니다. 그러면 채팅
연동이 조용히 끊깁니다. 이를 막으려면:

1. 이 서버는 `/`(루트)에 헬스체크용 HTTP 응답을 하도록 이미 되어 있습니다 (`server.js` 참고).
2. **무료 "핑" 서비스로 그 주소를 주기적으로 호출**해주세요. 예:
   - [UptimeRobot](https://uptimerobot.com) (무료, 5분 간격)
   - [cron-job.org](https://cron-job.org) (무료, 원하는 간격 설정 가능)
   - 배포된 주소(예: `https://chunmusic-soop-relay.onrender.com/`)를 5~10분마다 한 번씩
     호출하도록 등록하면, Render 쪽에서 계속 "요청이 들어오는 서비스"로 인식해서 슬립에
     걸리지 않습니다.
3. 등록 후에도 몇 시간 뒤에 로그가 계속 살아있는지 한 번씩 확인해보는 게 좋습니다.

## 새 멤버가 추가되거나 SOOP 아이디가 바뀌면

`server.js` 안의 `STREAMER_BJ_IDS` 객체를 `chunmusic/index.html`의 `STREAMERS` 배열과
동일하게 맞춰주세요. 두 파일의 `streamerId` 값이 서로 일치해야 채팅이 올바른 곳으로 갑니다.
