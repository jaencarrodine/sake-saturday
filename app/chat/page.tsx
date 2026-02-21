import Link from "next/link";
import Frame from "@/components/Frame";
import SakeChatUi from "@/components/sake-chat/sake-chat-ui";

export const dynamic = "force-dynamic";

export default function ChatPage() {
	return (
		<Frame title="SAKE SENSEI CHAT">
			<div className="mx-auto max-w-5xl space-y-4">
				<div className="text-neon-cyan transition-opacity hover:opacity-80">
					<Link href="/">← BACK TO HOME</Link>
				</div>
				<SakeChatUi />
			</div>
		</Frame>
	);
}
