import { useState, useEffect, useRef } from "react";
import { GameMode, WebSocketMessageType } from "../../types/room";
import Maru from "../../images/maru.svg";

export interface DrawData {
	x: number;
	y: number;
	color: string;
	lineWidth: number;
	isStart?: boolean;
}

interface CanvasProps {
	socket: WebSocket | null;
	drawData: DrawData | null;
	clearTrigger: number;
	isDrawer: boolean;
	currentWord: string | null;
	correctWord: string | null;
	correctAnswer: string | null;
	gameMode: (typeof GameMode)[keyof typeof GameMode] | null;
	showCorrectOverlay?: boolean;
}

const Canvas = ({
	socket,
	drawData,
	clearTrigger,
	isDrawer,
	currentWord,
	correctWord,
	correctAnswer,
	gameMode,
	showCorrectOverlay = false,
}: CanvasProps) => {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [isDrawing, setIsDrawing] = useState(false);
	const [isEraser, setIsEraser] = useState(false);
	const [color, setColor] = useState("#000000");
	const isStrokeDoneRef = useRef<boolean>(false);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		ctx.fillStyle = "white";
		ctx.fillRect(0, 0, canvas.width, canvas.height);
	}, []);

	useEffect(() => {
		if (!drawData) return;

		const canvas = canvasRef.current;
		if (!canvas) return;

		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		if (drawData.isStart) {
			ctx.beginPath();
			ctx.moveTo(drawData.x, drawData.y);
		} else {
			ctx.strokeStyle = drawData.color;
			ctx.lineWidth = drawData.lineWidth;
			ctx.lineCap = "round";
			ctx.lineTo(drawData.x, drawData.y);
			ctx.stroke();
		}
	}, [drawData]);

	useEffect(() => {
		if (clearTrigger === 0) return;

		const canvas = canvasRef.current;
		if (!canvas) return;

		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		ctx.fillStyle = "white";
		ctx.fillRect(0, 0, canvas.width, canvas.height);
	}, [clearTrigger]);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		const preventScroll = (e: globalThis.TouchEvent) => {
			e.preventDefault();
		};

		canvas.addEventListener("touchstart", preventScroll, {
			passive: false,
		});
		canvas.addEventListener("touchmove", preventScroll, { passive: false });

		return () => {
			canvas.removeEventListener("touchstart", preventScroll);
			canvas.removeEventListener("touchmove", preventScroll);
		};
	}, []);

	const startDrawing = (e: React.PointerEvent<HTMLCanvasElement>) => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		const rect = canvas.getBoundingClientRect();
		const scaleX = canvas.width / rect.width;
		const scaleY = canvas.height / rect.height;
		const x = (e.clientX - rect.left) * scaleX;
		const y = (e.clientY - rect.top) * scaleY;

		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		if (isStrokeDoneRef.current) {
			ctx.fillStyle = "white";
			ctx.fillRect(0, 0, canvas.width, canvas.height);
			isStrokeDoneRef.current = false;
			socket?.send(JSON.stringify({ type: "clear" }));
		}

		ctx.beginPath();
		ctx.moveTo(x, y);
		setIsDrawing(true);

		if (socket && socket.readyState === WebSocket.OPEN) {
			const strokeColor = isEraser ? "white" : color;
			const lineWidth = isEraser ? 15 : 3;

			socket.send(
				JSON.stringify({
					type: "draw",
					x: x,
					y: y,
					color: strokeColor,
					lineWidth: lineWidth,
					isStart: true,
				}),
			);
		}
	};

	const draw = (e: React.PointerEvent<HTMLCanvasElement>) => {
		if (!isDrawing) return;

		const canvas = canvasRef.current;
		if (!canvas) return;

		const rect = canvas.getBoundingClientRect();
		const scaleX = canvas.width / rect.width;
		const scaleY = canvas.height / rect.height;
		const x = (e.clientX - rect.left) * scaleX;
		const y = (e.clientY - rect.top) * scaleY;

		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		const strokeColor = isEraser ? "white" : color;
		const lineWidth = isEraser ? 15 : 3;

		ctx.strokeStyle = strokeColor;
		ctx.lineWidth = lineWidth;
		ctx.lineCap = "round";
		ctx.lineTo(x, y);
		ctx.stroke();

		if (socket && socket.readyState === WebSocket.OPEN) {
			socket.send(
				JSON.stringify({
					type: "draw",
					x: x,
					y: y,
					color: strokeColor,
					lineWidth: lineWidth,
				}),
			);
		}
	};

	const stopDrawing = () => {
		const canvas = canvasRef.current;
		if (canvas) {
			const ctx = canvas.getContext("2d");
			if (ctx) {
				ctx.closePath();
			}
		}

		setIsDrawing(false);

		if (gameMode === GameMode.ONE_STROKE) {
			isStrokeDoneRef.current = true;
		}

		if (socket && socket.readyState === WebSocket.OPEN) {
			socket.send(
				JSON.stringify({
					type: "drawEnd",
				}),
			);
		}
	};

	const clearCanvas = () => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		ctx.fillStyle = "white";
		ctx.fillRect(0, 0, canvas.width, canvas.height);

		if (socket && socket.readyState === WebSocket.OPEN) {
			socket.send(
				JSON.stringify({
					type: "clear",
				}),
			);
		}
	};

	return (
		<div className="card bg-[#fffde7]">
			<div className="card-body p-0">
				{isDrawer && (
					<div className="flex items-center justify-between mb-1">
						<h2
							className="card-title text-3xl font-bold mb-1"
							style={{
								color: "#6d4c41",
							}}
						>
							お題: {currentWord}
						</h2>
						<button
							className="px-3 py-2 rounded text-sm font-bold text-white cursor-pointer transition-opacity hover:opacity-90 ml-auto"
							style={{ backgroundColor: "#FF5447" }}
							onClick={() => {
								if (
									socket &&
									socket.readyState === WebSocket.OPEN
								) {
									socket.send(
										JSON.stringify({
											type: WebSocketMessageType.SKIP,
										}),
									);
								}
							}}
						>
							スキップ
						</button>
					</div>
				)}

				<div className="relative">
					<canvas
						ref={canvasRef}
						width={1280}
						height={720}
						onPointerDown={isDrawer ? startDrawing : undefined}
						onPointerMove={isDrawer ? draw : undefined}
						onPointerUp={isDrawer ? stopDrawing : undefined}
						onPointerLeave={isDrawer ? stopDrawing : undefined}
						className={`border-3 border-[#f4d59c] rounded-lg bg-white w-full ${isDrawer ? "cursor-crosshair" : "cursor-default"}`}
						aria-label="描画キャンバス"
					/>
					{showCorrectOverlay && (
						<div className="absolute inset-0 pointer-events-none">
							<div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center text-center gap-1">
								<img
									src={Maru}
									alt="正解"
									className="w-40 h-auto opacity-70"
								/>
								<p style={{ color: "#6d4c41" }}>
									回答: {correctWord} 正解者: {correctAnswer}
								</p>
							</div>
						</div>
					)}
				</div>

				{isDrawer && (
					<div className="flex items-center gap-2">
						{[
							{ hex: "#000000", label: "黒" },
							{ hex: "#ef4444", label: "赤" },
							{ hex: "#3b82f6", label: "青" },
							{ hex: "#22c55e", label: "緑" },
							{ hex: "#eab308", label: "黄" },
							{ hex: "#a855f7", label: "紫" },
						].map(({ hex, label }) => (
							<button
								key={hex}
								onClick={() => {
									setColor(hex);
									setIsEraser(false);
								}}
								className={`btn btn-sm btn-circle border-2 border-transparent
									${color === hex ? "ring-2 ring-offset-2 ring-primary border-primary" : "opacity-70"}
								`}
								style={{ backgroundColor: hex }}
								aria-label={label}
							/>
						))}
						{gameMode !== GameMode.ONE_STROKE && (
							<button
								onClick={() => setIsEraser(!isEraser)}
								className="px-3 py-1 rounded text-sm font-bold cursor-pointer transition-opacity hover:opacity-90"
								style={
									isEraser
										? {
												backgroundColor: "#10b981",
												border: "2px solid transparent",
												color: "#fff",
											}
										: {
												backgroundColor: "transparent",
												border: "2px solid #10b981",
												color: "#10b981",
											}
								}
							>
								消しゴム
							</button>
						)}
						{gameMode !== GameMode.ONE_STROKE && (
							<button
								onClick={clearCanvas}
								className="px-3 py-2 rounded text-sm font-bold text-white cursor-pointer transition-opacity hover:opacity-80! ml-auto"
								style={{
									backgroundColor: "#4d8fff",
								}}
							>
								クリア
							</button>
						)}
					</div>
				)}
			</div>
		</div>
	);
};

export default Canvas;
