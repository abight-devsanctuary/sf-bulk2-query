import { PassThrough, Transform } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';

class StreamManager {
    constructor() {
        this._internalStream = new PassThrough();
    }

    /**
     * Retrieves the internal stream.
     *
     * @returns {PassThrough} The internal PassThrough stream.
     */
    getInternalStream() {
        return this._internalStream;
    }

    /**
     * Adds an incoming stream to the internal stream.
     *
     * @async
     * @param {ReadableStream} incomingStream - The stream to add to the internal stream.
     * @returns {Promise<void>} A promise that resolves when the incoming stream has ended or rejects if an error occurs.
     */
    async addToStream(incomingStream) {
        return new Promise((resolve, reject) => {
            // Setting end = false; Prevent ending the internal stream prematurely
            incomingStream.pipe(this._internalStream, { end: false });

            incomingStream.on('end', () => {
                resolve();
            });

            incomingStream.on('error', (err) => {
                reject(err);
            });
        });
    }

    /**
     * Creates a transform stream that removes the header line from a CSV stream.
     *
     * @param {string} [encoding="utf-8"] - The encoding of the CSV data.
     * @returns {Transform} A transform stream that filters out the first line.
     */
    removeCsvHeaders(encoding = 'utf-8') {
        let headerSkipped = false;
        const decoder = new StringDecoder(encoding);
        let bufferedData = '';

        return new Transform({
            transform(chunk, encoding, callback) {
                bufferedData += decoder.write(chunk);

                if (!headerSkipped) {
                    const newlineIndex = bufferedData.indexOf('\n');
                    if (newlineIndex !== -1) {
                        // Skip the first line (up to the first newline)
                        bufferedData = bufferedData.substring(newlineIndex + 1);
                        headerSkipped = true;
                    } else {
                        // If no newline is found, buffer the data and wait for more
                        return callback();
                    }
                }

                this.push(Buffer.from(bufferedData));
                bufferedData = ''; // Reset buffer for subsequent chunks
                callback();
            },

            flush(callback) {
                // Handle any remaining buffered data (should be empty in most cases)
                this.push(Buffer.from(bufferedData));
                callback();
            },
        });
    }

    /**
     * Closes the internal stream.
     *
     * @async
     * @returns {Promise<void>} A promise that resolves when the stream is closed or rejects if an error occurs.
     */
    closeStream() {
        return new Promise((resolve, reject) => {
            this._internalStream.end((err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }
}
export default StreamManager;
