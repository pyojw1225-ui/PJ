"use strict";

(() => {
  const templates = {
    application: [
      ["진행 단계", "예: 약관 확인 후 다음 단계로 이동"],
      ["오류 또는 화면 문구", "예: 다음 버튼을 눌러도 화면이 바뀌지 않아요."],
      ["확인 요청", "예: 다시 시도하기 전에 확인할 항목이 있나요?"]
    ],
    product: [
      ["상품명", "예: 문의하려는 결제성 여신 상품"],
      ["문의 주제", "예: 상품 안내 또는 운영 기준"],
      ["확인 요청", "예: 영업점에서 참고할 안내 자료가 있나요?"]
    ],
    collaboration: [
      ["협업 목적", "예: 비대면 신청 과정의 불편 개선"],
      ["요청 범위", "예: 영업점 안내 문구 검토"],
      ["희망 일정", "예: 다음 주 중 초안 검토"]
    ]
  };
  const fields = document.querySelector("#request-fields");
  const kind = document.querySelector("#request-kind");
  const output = document.querySelector("#request-output");
  const copy = document.querySelector("#copy-request");
  const status = document.querySelector("#copy-status");
  const drafts = new Map();

  function renderPreview() {
    const sections = [...fields.querySelectorAll("textarea")].map(field =>
      `${field.dataset.label}\n${field.value.trim() || "내용을 적어 주세요."}`
    );
    output.value = [`[${kind.selectedOptions[0].textContent}]`, ...sections].join("\n\n");
    status.textContent = "";
  }

  function renderFields() {
    const values = drafts.get(kind.value) ?? [];
    fields.replaceChildren(...templates[kind.value].map(([name, placeholder], index) => {
      const label = document.createElement("label");
      label.textContent = name;
      const field = document.createElement("textarea");
      field.rows = 2;
      field.maxLength = 400;
      field.dataset.label = name;
      field.placeholder = placeholder;
      field.value = values[index] ?? "";
      label.append(field);
      return label;
    }));
    renderPreview();
  }

  fields.addEventListener("input", () => {
    drafts.set(kind.value, [...fields.querySelectorAll("textarea")].map(field => field.value));
    renderPreview();
  });
  kind.addEventListener("change", renderFields);

  for (const link of document.querySelectorAll("[data-request-kind]")) {
    link.addEventListener("click", () => {
      kind.value = link.dataset.requestKind;
      renderFields();
    });
  }

  copy.addEventListener("click", async () => {
    const text = output.value;
    try {
      await navigator.clipboard.writeText(text);
      status.textContent = "문의 문구를 복사했어요.";
      return;
    } catch {
      output.focus();
      output.select();
    }
    status.textContent = document.execCommand("copy")
      ? "문의 문구를 복사했어요."
      : "문구를 선택했어요. 복사 단축키를 눌러 주세요.";
  });

  renderFields();
})();
