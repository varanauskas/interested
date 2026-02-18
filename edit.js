const headerLength
    = Uint32Array.BYTES_PER_ELEMENT
    + Uint16Array.BYTES_PER_ELEMENT
    + Uint16Array.BYTES_PER_ELEMENT
    + Uint8Array.BYTES_PER_ELEMENT;

const dataLength = DATA.payments.length * (Uint16Array.BYTES_PER_ELEMENT + DATA.recipients * Uint32Array.BYTES_PER_ELEMENT);

const bufferLength = headerLength + dataLength;

const buffer = new ArrayBuffer(bufferLength);
const dataView = new DataView(buffer);

let offset = 0;
/**
 * @param {8 | 16 | 32} size
 * @param {number} value
 */
function writeUint(size, value) {
    dataView[`setUint${size}`](offset, value);
    offset += size / 8;
}

/**
 * @param {Temporal.PlainDate} date
 */
function toEpochDay(date) {
    const epoch = Temporal.PlainDate.from("1970-01-01");
    return date.since(epoch).total("days");
}

writeUint(32, DATA.principal);
writeUint(16, DATA.interest);
writeUint(8, DATA.recipients);
writeUint(8, DATA.payments.length);

for (const { date, amounts } of DATA.payments) {
    writeUint(16, toEpochDay(date));
    for (let i = 0; i < DATA.recipients; i++) {
        writeUint(32, amounts[i] || 0);
    }
}

const editArray = new Uint8Array(buffer);
console.log(editArray.toBase64({ "alphabet": "base64url" }));