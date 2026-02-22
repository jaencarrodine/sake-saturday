declare module 'heic-convert' {
	type HeicConvertFormat = 'JPEG' | 'PNG';

	type HeicConvertOptions = {
		buffer: Buffer | Uint8Array | ArrayBuffer;
		format: HeicConvertFormat;
		quality?: number;
	};

	const heicConvert: (
		options: HeicConvertOptions
	) => Promise<Buffer | Uint8Array | ArrayBuffer>;

	export default heicConvert;
}
