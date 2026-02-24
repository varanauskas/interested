// INPUT
// Params for formatting the currency, e.g. ?locale=en-US&currency=USD
const params = new URLSearchParams(location.search);
const { format } = new Intl.NumberFormat(params.get("locale") ?? undefined, { style: "currency", currency: params.get("currency") ?? undefined });

// Input data
const DATA = (function readData() {
    /**
     * @param {number} epochDay
     */
    function fromEpochDay(epochDay) {
        const epoch = Temporal.PlainDate.from("1970-01-01");
        return epoch.add({ days: epochDay });
    }

    const dataView = new DataView(Uint8Array.fromBase64(location.hash.substring(1), { alphabet: "base64url" }).buffer);
    /**
     * @type {{
     *  principal: number,
     *  interest: number,
     *  recipients: number,
     *  payments: { date: Temporal.PlainDate, amounts: number[] }[]
     * }}
     */
    const INPUT = { payments: [] };
    let index = 0;
    function readUint(size) {
        const value = dataView[`getUint${size}`](index);
        index += size / 8;
        return value;
    }

    INPUT.principal = readUint(32);
    INPUT.interest = readUint(16);
    INPUT.recipients = readUint(8);

    const customPaymentCount = readUint(8);
    for (let i = 0; i < customPaymentCount; i++) {
        const amounts = [];
        for (let j = 0; j < INPUT.recipients; j++) {
            amounts.push(readUint(32));
        }
        INPUT.payments.push({
            date: fromEpochDay(readUint(16)),
            amounts,
        });
    }

    const fixedAmountPaymentCount = readUint(8);
    for (let i = 0; i < fixedAmountPaymentCount; i++) {
        const amounts = [];
        for (let j = 0; j < INPUT.recipients; j++) {
            amounts.push(readUint(32));
        }
        const dateCount = readUint(8);
        for (let j = 0; j < dateCount; j++) {
            INPUT.payments.push({
                date: fromEpochDay(readUint(16)),
                amounts,
            });
        }
    }

    const dayOfMonthPaymentCount = readUint(8);
    console.log({ dayOfMonthPaymentCount });
    for (let i = 0; i < dayOfMonthPaymentCount; i++) {
        const amounts = [];
        for (let j = 0; j < INPUT.recipients; j++) {
            amounts.push(readUint(32));
        }
        const firstDate = fromEpochDay(readUint(16));
        const lastDate = fromEpochDay(readUint(16));
        let date = firstDate;
        while (Temporal.PlainDate.compare(lastDate, date) >= 0) {
            INPUT.payments.push({
                date,
                amounts,
            });
            date = date.add({ months: 1 });
        }
    }

    INPUT.payments.sort((a, b) => Temporal.PlainDate.compare(a.date, b.date));
    return INPUT;
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

function insertRow(date, payments, interest, total) {
    const row = tBody.insertRow();
    const cell = row.insertCell();
    if (date) cell.textContent = date;
    for (let i = 0; i < DATA.recipients; i++) {
        const cell = row.insertCell();
        if (payments[i]) cell.textContent = format(payments[i]);
    }
    row.insertCell().textContent = interest;
    row.insertCell().textContent = format(total);
    return row;
}

insertRow(undefined, [], new Intl.NumberFormat(params.get("locale") ?? undefined, { style: "percent" }).format(DATA.interest / 10000), principal).classList.add("total");

function addInterest(interest) {
    totalInterest += interest;
    principal += interest;
    return interest;
}


/** @type {{ date: Temporal.PlainDate }} */
let lastPayment;
function insertPayment(date, amounts) {
    const amountCells = amounts.map((amount, i) => {
        if (amount) {
            principal -= amount / 100;
            totalPaymentAmounts[i] += amount / 100;
            return amount / 100;
        }
    });
    insertRow(date.toString(), amountCells, format(addInterest(principal * DAILY_INTEREST_RATE)), principal).classList.add("payment");

    lastPayment = { date };
}

const [firstPayment, ...restPayments] = DATA.payments;
insertPayment(firstPayment.date, firstPayment.amounts);

function addPayment({ date, amounts }) {
    const nextDayAfterLastPayment = lastPayment.date.add({ days: 1 });
    if (!nextDayAfterLastPayment.equals(date)) {
        const dayBeforeCurrentPayment = date.subtract({ days: 1 });
        insertRow(
            nextDayAfterLastPayment.equals(dayBeforeCurrentPayment) ? nextDayAfterLastPayment.toString() : `${nextDayAfterLastPayment} - ${dayBeforeCurrentPayment}`,
            [undefined, undefined],
            format(addInterest(principal * Math.pow(1 + DAILY_INTEREST_RATE, dayBeforeCurrentPayment.since(lastPayment.date).total("days")) - principal)),
            principal
        ).classList.add("intermediate");
    }
    insertPayment(date, amounts);
}

let i = 0;
for (const now = Temporal.Now.plainDateISO(); i < restPayments.length && Temporal.PlainDate.compare(restPayments[i].date, now) <= 0; i++) {
    addPayment(restPayments[i]);
}

insertRow("Total", totalPaymentAmounts, format(totalInterest), principal).classList.add("total");

for (; i < restPayments.length; i++) {
    addPayment(restPayments[i]);
}
insertRow("Total", totalPaymentAmounts, format(totalInterest), principal).classList.add("total");