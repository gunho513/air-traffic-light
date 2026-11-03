// Vercel 서버리스 함수: 클라이언트의 요청을 받아 공공데이터포털 API를 대신 호출하는 백엔드 함수
export default async function handler(req, res) {
  // 브라우저에서 안전하게 접근할 수 있도록 CORS 헤더 설정
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  // 주소 쿼리스트링에서 sido(시도 이름) 파라미터를 읽어오며, 값이 없으면 기본값으로 '서울' 설정
  const sido = req.query.sido || '서울';

  // 서버 환경변수에서 AIRKOREA_KEY 값을 읽어옴 (코드에 인증키를 노출하지 않고 보안 유지)
  const serviceKey = process.env.AIRKOREA_KEY;

  // 서버 환경변수에 인증키가 없을 경우 에러 메시지 반환
  if (!serviceKey) {
    return res.status(500).json({
      error: '서버 환경변수(AIRKOREA_KEY)가 설정되지 않았습니다. .env.local 또는 Vercel 설정을 확인해주세요.'
    });
  }

  // 환경변수의 Decoding 키를 URL 파라미터 규격에 맞게 encodeURIComponent로 변환
  const encodedKey = encodeURIComponent(serviceKey);

  // 공공데이터포털 에어코리아 시도별 실시간 대기오염 측정정보 API 요청 URL 구성
  const apiUrl = `https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getCtprvnRltmMesureDnsty?serviceKey=${encodedKey}&returnType=json&sidoName=${encodeURIComponent(sido)}&numOfRows=100&pageNo=1&ver=1.3`;

  try {
    // Node.js 기본 내장 fetch 함수로 공공데이터포털에 요청 전송
    const response = await fetch(apiUrl);
    
    // 응답 데이터를 문자열(텍스트) 형태로 먼저 수신 (XML 또는 JSON 둘 다 처리 가능)
    const rawText = await response.text();

    // 수신된 문자열이 정상적인 JSON인지 파싱 시도
    let data;
    try {
      data = JSON.parse(rawText);
    } catch (parseError) {
      // 인증키 불일치 등으로 JSON이 아닌 XML 에러 메시지가 온 경우 한글 안내 문구 반환
      return res.status(400).json({
        error: '인증키 또는 요청값을 확인해주세요.',
        detail: rawText
      });
    }

    // 응답 데이터 헤더에서 결과 코드(resultCode)와 결과 메시지(resultMsg) 확인
    const resultCode = data?.response?.header?.resultCode;
    const resultMsg = data?.response?.header?.resultMsg;

    // 정상 처리 코드('00')가 아닐 경우 실패 사유를 한국어로 클라이언트에 전달
    if (resultCode && resultCode !== '00') {
      return res.status(400).json({
        error: `공공데이터포털 처리 실패 안내: ${resultMsg || '알 수 없는 오류'} (코드: ${resultCode})`,
        resultCode: resultCode
      });
    }

    // 정상적으로 대기오염 데이터를 받아왔다면 클라이언트에 JSON 형태로 전송
    return res.status(200).json(data);

  } catch (error) {
    // 서버 통신 장애 등 예기치 않은 오류 발생 시 에러 반환
    console.error('서버리스 함수 실행 중 오류:', error);
    return res.status(500).json({
      error: '공공데이터포털 서버 통신 중 오류가 발생했습니다.',
      detail: error.message
    });
  }
}

