const $ = id => document.getElementById(id);

let dashboard = null;

async function api(path, options = {}) {
  const response = await fetch(`/api/${path}`, {
    headers: {
      "Content-Type": "application/json"
    },
    ...options
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "درخواست ناکام ہوگئی");
  }

  return data;
}

async function loadDashboard() {
  try {
    dashboard = await api("dashboard");

    const members = dashboard.members || [];
    const paid = members.filter(x => x.paid == 1).length;
    const unpaid = members.length - paid;
    const amount = Number(dashboard.amount || 0);

    $("totalMembers").textContent = members.length;
    $("paidMembers").textContent = paid;
    $("unpaidMembers").textContent = unpaid;
    $("totalAmount").textContent =
      `${(paid * amount).toLocaleString()} PKR`;

    $("currentMonth").textContent =
      dashboard.month
        ? `مہینہ: ${dashboard.month.month_name}`
        : "پہلے نیا مہینہ شروع کریں";

    $("membersTable").innerHTML = members.map(member => `
      <tr>
        <td>${escapeHtml(member.name)}</td>
        <td>${member.phone ? escapeHtml(member.phone) : "—"}</td>
        <td>
          <input
            type="checkbox"
            ${member.paid == 1 ? "checked" : ""}
            onchange="changePayment(${member.id}, this.checked)"
          >
        </td>
        <td class="${member.paid == 1 ? "paid" : "unpaid"}">
          ${member.paid == 1 ? "ادا شدہ" : "بقایا"}
        </td>
      </tr>
    `).join("");

    if (dashboard.month?.winner_id) {
      const winner = members.find(
        x => x.id == dashboard.month.winner_id
      );

      if (winner) showWinner(winner);
    }

  } catch (error) {
    alert(error.message);
  }
}

async function changePayment(memberId, paid) {
  if (!dashboard?.month) {
    alert("پہلے نیا مہینہ شروع کریں");
    return;
  }

  try {
    await api("payments", {
      method: "POST",
      body: JSON.stringify({
        member_id: memberId,
        month_id: dashboard.month.id,
        paid
      })
    });

    await loadDashboard();
  } catch (error) {
    alert(error.message);
  }
}

$("settingsForm").addEventListener("submit", async event => {
  event.preventDefault();

  try {
    await api("settings", {
      method: "POST",
      body: JSON.stringify({
        monthly_amount: $("monthlyAmount").value,
        pin: $("adminPin").value
      })
    });

    alert("ماہانہ کمیٹی محفوظ ہوگئی");
    await loadDashboard();
  } catch (error) {
    alert(error.message);
  }
});

$("memberForm").addEventListener("submit", async event => {
  event.preventDefault();

  try {
    await api("members", {
      method: "POST",
      body: JSON.stringify({
        name: $("memberName").value,
        phone: $("memberPhone").value
      })
    });

    event.target.reset();
    alert("ممبر کامیابی سے شامل ہوگیا");
    await loadDashboard();
  } catch (error) {
    alert(error.message);
  }
});

$("monthForm").addEventListener("submit", async event => {
  event.preventDefault();

  try {
    await api("months", {
      method: "POST",
      body: JSON.stringify({
        month_name: $("monthName").value
      })
    });

    event.target.reset();
    alert("نیا مہینہ شروع ہوگیا");
    await loadDashboard();
  } catch (error) {
    alert(error.message);
  }
});

$("drawButton").addEventListener("click", async () => {
  if (!dashboard?.month) {
    alert("پہلے نیا مہینہ شروع کریں");
    return;
  }

  if (!confirm("کیا آپ قرعہ‌اندازی کرنا چاہتے ہیں؟")) return;

  try {
    const result = await api("draw", {
      method: "POST",
      body: JSON.stringify({
        month_id: dashboard.month.id
      })
    });

    showWinner(result.winner);
    await loadDashboard();
  } catch (error) {
    alert(error.message);
  }
});

function showWinner(winner) {
  const box = $("winnerBox");

  box.style.display = "block";
  box.innerHTML = `
    🎉 اس ماہ کی کمیٹی مل گئی 🎉<br>
    فاتح: ${escapeHtml(winner.name)}<br>
    موبائل: ${escapeHtml(winner.phone)}
  `;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}

loadDashboard();
