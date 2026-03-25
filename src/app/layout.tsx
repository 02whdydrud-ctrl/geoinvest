export const metadata = {
  title: 'GeoInvest — 지정학 리스크를 한국 투자 언어로',
  description: '전쟁·분쟁 리스크를 한국 주식 섹터 언어로 번역합니다',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
