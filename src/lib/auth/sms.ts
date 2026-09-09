import "server-only";
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
import { sendMail } from "@/lib/mail/send";

export async function sendPhoneOtp(phone: string, code: string) {
  if (
    process.env.SMS_PROVIDER === "mailpit" &&
    process.env.NODE_ENV !== "production" &&
    process.env.MAIL_PROVIDER === "mailpit"
  ) {
    const result = await sendMail({
      to: "sms@oshinest.local",
      subject: `SMS ${phone}`,
      text: `OshiNest 確認コード: ${code}`,
    });
    if (!result.ok) throw new Error("開発用SMSを保存できませんでした");
    return;
  }
  if (process.env.SMS_PROVIDER !== "sns" || !process.env.AWS_REGION)
    throw new Error("SMS_PROVIDER and AWS_REGION are required for SMS");
  const client = new SNSClient({
    region: process.env.AWS_REGION,
    maxAttempts: 1,
  });
  try {
    await client.send(
      new PublishCommand({
        PhoneNumber: phone,
        Message: `OshiNest 確認コード: ${code}（10分間有効）`,
        MessageAttributes: {
          "AWS.SNS.SMS.SMSType": {
            DataType: "String",
            StringValue: "Transactional",
          },
        },
      }),
      { abortSignal: AbortSignal.timeout(5_000) },
    );
  } finally {
    client.destroy();
  }
}
