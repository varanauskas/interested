// INPUT
// Params for formatting the currency, e.g. ?locale=en-US&currency=USD
const params = new URLSearchParams(location.search);
const { format } = new Intl.NumberFormat(params.get("locale") ?? undefined, { style: "currency", currency: params.get("currency") ?? undefined });

// Input data
const DATA = (function readData() {
    /**
     * Binary Format:
     * Uint32 - AMOUNT (in cents)
     * Uint16 - DATE/PERCENT (date as days since 1970-01-01, percent as basis points)
     * Uint8 - COUNT
     * 
     * AMOUNT(principal)+PERCENT(interest)+COUNT(recipients)+COUNT(payments)+[payments * [DATE(payment) + recipients * AMOUNT(payment)]]
     */
    const inputView = new DataView(Uint8Array.fromBase64(location.hash.substring(1), { alphabet: "base64url" }).buffer);
    /**
     * @type {{
     *  principal: number,
     *  interest: number,
     *  recipients: number,
     *  payments: { date: Temporal.PlainDate, amounts: number[] }[]
     * }}
     */
    const DATA = { payments: [] };
    let readOffset = 0;
    /**
     * @param {8 | 16 | 32} size
     */
    function readUint(size) {
        const value = inputView[`getUint${size}`](readOffset);
        readOffset += size / 8;
        return value;
    }
    DATA.principal = readUint(32);
    DATA.interest = readUint(16);
    DATA.recipients = readUint(8);
    const paymentCount = readUint(8);
    /**
     * @param {number} epochDay
     */
    function fromEpochDay(epochDay) {
        const epoch = Temporal.PlainDate.from("1970-01-01");
        return epoch.add({ days: epochDay });
    }
    for (let i = 0; i < paymentCount; i++) {
        const date = fromEpochDay(readUint(16));
        const amounts = [];
        for (let j = 0; j < DATA.recipients; j++) {
            amounts.push(readUint(32));
        }
        DATA.payments.push({ date, amounts });
    }
    return DATA;
})();

const [tBody] = /** @type {HTMLTableElement} */ (table).tBodies;

let principal = DATA.principal / 100;
const [headRow] = /** @type {HTMLTableElement} */ (table).tHead.rows;
const totalPaymentAmounts = [];
for (let i = 0; i < DATA.recipients; i++) {
    headRow.insertCell(1).outerHTML = `<th>- Payment</th>`;
    totalPaymentAmounts.push(0);
}
let totalInterest = 0;

const DAYS_IN_YEAR = 365;
const YEARLY_INTEREST_RATE = DATA.interest / 10000;
const DAILY_INTEREST_RATE = YEARLY_INTEREST_RATE / DAYS_IN_YEAR;

const firstCell = tBody.insertRow().insertCell();
firstCell.textContent = format(principal);
firstCell.colSpan = 5;

function addInterest(interest) {
    totalInterest += interest;
    principal += interest;
    return interest;
}

function insertRow(date, payments, interest, total) {
    const row = tBody.insertRow();
    row.insertCell().textContent = date;
    for (const payment of payments) {
        const cell = row.insertCell();
        if (payment) cell.textContent = format(payment);
    }
    row.insertCell().textContent = format(interest);
    row.insertCell().textContent = format(total);
    return row;
}

/** @type {{ date: Temporal.PlainDate }} */
let lastPayment;
function insertPayment(date, amounts) {
    const amountCells = amounts.map((amount, i) => {
        if (amount) {
            principal -= amount;
            totalPaymentAmounts[i] += amount;
            return amount;
        }
    });
    insertRow(date.toString(), amountCells, addInterest(principal * DAILY_INTEREST_RATE), principal).classList.add("payment");

    lastPayment = { date };
}

const [firstPayment, ...restPayments] = DATA.payments;
insertPayment(firstPayment.date, firstPayment.amounts);

for (const { date, amounts } of restPayments) {
    const nextDayAfterLastPayment = lastPayment.date.add({ days: 1 });
    if (!nextDayAfterLastPayment.equals(date)) {
        const dayBeforeCurrentPayment = date.subtract({ days: 1 });
        insertRow(
            nextDayAfterLastPayment.equals(dayBeforeCurrentPayment) ? nextDayAfterLastPayment.toString() : `${nextDayAfterLastPayment} - ${dayBeforeCurrentPayment}`,
            [undefined, undefined],
            addInterest(principal * Math.pow(1 + DAILY_INTEREST_RATE, dayBeforeCurrentPayment.since(lastPayment.date).total("days")) - principal),
            principal
        ).classList.add("intermediate");
    }
    insertPayment(date, amounts);
}

insertRow("Total", totalPaymentAmounts, totalInterest, principal).classList.add("total");