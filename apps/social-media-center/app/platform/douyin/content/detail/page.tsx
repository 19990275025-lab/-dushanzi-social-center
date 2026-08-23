import { PlatformLayout } from "@/components/v2/PlatformLayout";
import ContentDetailPage from "@/app/insights/content/detail/page";

export default function DouyinContentDetailV2Page() {
  return <PlatformLayout platform="douyin" activeSection="content">
    <ContentDetailPage embedded />
  </PlatformLayout>;
}
