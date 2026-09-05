const CARRIER_LABEL: Record<string, string> = {
  yamato: "ヤマト運輸",
  sagawa: "佐川急便",
  japanpost: "日本郵便",
  other: "配送業者",
};

const CARRIER_URL: Record<string, (trackingNumber: string) => string> = {
  yamato: (n) => `https://toi.kuronekoyamato.co.jp/cgi-bin/tneko?number=${n}`,
  sagawa: (n) => `https://k2k.sagawa-exp.co.jp/p/sagawa/web/okurijoinput.jsp?okurijoNo=${n}`,
  japanpost: (n) => `https://trackings.post.japanpost.jp/services/srv/search/?requestNo1=${n}`,
};

export function TrackingLink({
  carrier,
  trackingNumber,
}: {
  carrier: string;
  trackingNumber: string;
}) {
  const buildUrl = CARRIER_URL[carrier];
  const label = CARRIER_LABEL[carrier] ?? carrier;

  if (!buildUrl) {
    return (
      <span className="text-sm">
        {label}: {trackingNumber}
      </span>
    );
  }

  return (
    <a
      href={buildUrl(trackingNumber)}
      target="_blank"
      rel="noopener noreferrer"
      className="text-sm text-primary underline underline-offset-2"
    >
      {label}: {trackingNumber}
    </a>
  );
}
