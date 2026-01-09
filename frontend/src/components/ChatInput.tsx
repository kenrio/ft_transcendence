const ChatInput = () => {
	return (
		<div className="join w-full">
			<input
				className="input input-bordered join-item flex-1"
				placeholder="答えを入力..."
			/>
			<button className="btn btn-primary join-item">送信</button>
		</div>
	)
}

export default ChatInput
