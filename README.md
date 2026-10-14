# 출결·서류 관리

담임교사용 학생 출결 상황·증빙서류 수합 관리 웹앱. 설계는 [docs/DESIGN.md](docs/DESIGN.md) 참고.

- 데이터는 브라우저 안(IndexedDB)에만 저장되고 외부로 전송되지 않습니다.
- 다른 컴퓨터로 옮기거나 브라우저 데이터를 지우기 전에 **설정 → 백업**에서 백업 파일을 저장하세요.

## 개발

```bash
npm install
npm run dev      # 개발 서버
npm test         # 규칙 로직 테스트
npm run build    # dist/ 에 정적 파일 생성
```

`dist/` 폴더를 정적 호스팅(GitHub Pages 등)에 올리면 됩니다.
