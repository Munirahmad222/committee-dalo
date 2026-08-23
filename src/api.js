function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}

function pakistanPhone(phone) {
  return /^(03\d{9}|\+923\d{9})$/.test(phone);
}

export async function handleApi(request, env, path) {
  const method = request.method;

  try {
    if (method === "GET" && path === "/members") {
      const result = await env.DB.prepare(`
        SELECT * FROM members
        WHERE active = 1
        ORDER BY name
      `).all();

      return json(result.results);
    }

    if (method === "GET" && path === "/settings") {
      const result = await env.DB.prepare(`
        SELECT monthly_amount FROM settings WHERE id = 1
      `).first();

      return json(result);
    }

    if (method === "POST" && path === "/settings") {
      const body = await request.json();
      const amount = Number(body.monthly_amount);
      const pin = String(body.pin || "");

      const validPin = await env.DB.prepare(`
        SELECT id FROM settings
        WHERE id = 1 AND admin_pin = ?
      `).bind(pin).first();

      if (!validPin) return json({ error: "Admin PIN غلط ہے" }, 401);
      if (!amount || amount < 1) {
        return json({ error: "کمیٹی کی درست رقم درج کریں" }, 400);
      }

      await env.DB.prepare(`
        UPDATE settings SET monthly_amount = ?
        WHERE id = 1
      `).bind(amount).run();

      return json({ success: true });
    }

    if (method === "POST" && path === "/members") {
      const body = await request.json();
      const name = String(body.name || "").trim();
      const phone = String(body.phone || "").trim();

      if (!name) {
        return json({ error: "ممبر کا نام درج کریں" }, 400);
      }
      if (phone && !pakistanPhone(phone)) {
        return json({ error: "موبائل نمبر درست پاکستانی فارمیٹ میں ہونا چاہیے" }, 400);
      }

      await env.DB.prepare(`
        INSERT INTO members (name, phone)
        VALUES (?, ?)
      `).bind(name, phone || null).run();

      return json({ success: true });
    }

    if (method === "PUT" && path.match(/^\/members\/\d+$/)) {
      const memberId = Number(path.split("/")[2]);
      const body = await request.json();
      const name = String(body.name || "").trim();
      const phone = String(body.phone || "").trim();

      if (!name) {
        return json({ error: "ممبر کا نام درج کریں" }, 400);
      }
      if (phone && !pakistanPhone(phone)) {
        return json({ error: "موبائل نمبر درست پاکستانی فارمیٹ میں ہونا چاہیے" }, 400);
      }

      await env.DB.prepare(`
        UPDATE members SET name = ?, phone = ? WHERE id = ?
      `).bind(name, phone || null, memberId).run();

      return json({ success: true });
    }

    if (method === "DELETE" && path.match(/^\/members\/\d+$/)) {
      const memberId = Number(path.split("/")[2]);

      // soft delete: member ka record rakha jata hai (purani payments/history ke liye)
      // lekin ab wo naye mahinon mein shamil nahi hoga
      await env.DB.prepare(`
        UPDATE members SET active = 0 WHERE id = ?
      `).bind(memberId).run();

      return json({ success: true });
    }

    if (method === "POST" && path === "/months") {
      const body = await request.json();
      const monthName = String(body.month_name || "").trim();

      if (!monthName) {
        return json({ error: "مہینے کا نام درج کریں" }, 400);
      }

      const month = await env.DB.prepare(`
        INSERT INTO months (month_name)
        VALUES (?)
        RETURNING id
      `).bind(monthName).first();

      await env.DB.prepare(`
        INSERT INTO payments (member_id, month_id)
        SELECT id, ? FROM members
        WHERE active = 1 AND won = 0
      `).bind(month.id).run();

      return json({ success: true, month_id: month.id });
    }

    if (method === "GET" && path === "/dashboard") {
      const month = await env.DB.prepare(`
        SELECT * FROM months
        ORDER BY id DESC LIMIT 1
      `).first();

      const members = await env.DB.prepare(`
        SELECT
          m.id,
          m.name,
          m.phone,
          m.won,
          COALESCE(p.paid, 0) AS paid
        FROM members m
        LEFT JOIN payments p
          ON p.member_id = m.id
         AND p.month_id = ?
        WHERE m.active = 1
        ORDER BY m.name
      `).bind(month?.id || 0).all();

      const settings = await env.DB.prepare(`
        SELECT monthly_amount FROM settings WHERE id = 1
      `).first();

      return json({
        month,
        amount: settings.monthly_amount,
        members: members.results
      });
    }

    if (method === "POST" && path === "/payments") {
      const body = await request.json();

      await env.DB.prepare(`
        UPDATE payments
        SET paid = ?, paid_at = CASE WHEN ? = 1
          THEN CURRENT_TIMESTAMP ELSE NULL END
        WHERE member_id = ? AND month_id = ?
      `).bind(
        body.paid ? 1 : 0,
        body.paid ? 1 : 0,
        Number(body.member_id),
        Number(body.month_id)
      ).run();

      return json({ success: true });
    }

    if (method === "POST" && path === "/draw") {
      const body = await request.json();
      const monthId = Number(body.month_id);

      const candidates = await env.DB.prepare(`
        SELECT m.id, m.name, m.phone
        FROM members m
        INNER JOIN payments p ON p.member_id = m.id
        WHERE p.month_id = ?
          AND p.paid = 1
          AND m.won = 0
      `).bind(monthId).all();

      if (!candidates.results.length) {
        return json({
          error: "قرعہ‌اندازی کے لیے کوئی ادا شدہ ممبر موجود نہیں"
        }, 400);
      }

      const winner =
        candidates.results[
          Math.floor(Math.random() * candidates.results.length)
        ];

      await env.DB.prepare(`
        UPDATE months
        SET winner_id = ?, drawn_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(winner.id, monthId).run();

      await env.DB.prepare(`
        UPDATE members
        SET won = 1
        WHERE id = ?
      `).bind(winner.id).run();

      return json({
        success: true,
        winner
      });
    }

    return json({ error: "API route نہیں ملی" }, 404);

  } catch (error) {
    return json({
      error: error.message || "Server error"
    }, 500);
  }
}
