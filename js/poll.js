import { supabaseClient } from "./supabase.js";

const pollList = document.getElementById("pollList");
const loading = document.getElementById("loading");
const emptyState = document.getElementById("emptyState");
const errorState = document.getElementById("errorState");
const errorText = document.getElementById("errorText");
const retryBtn = document.getElementById("retryBtn");
const searchInput = document.getElementById("searchInput");
const pollCount = document.getElementById("pollCount");
const voteCount = document.getElementById("voteCount");
const yourVoteCount = document.getElementById("yourVoteCount");

const modal = document.getElementById("pollModal");
const openPollModal = document.getElementById("openPollModal");
const emptyCreateBtn = document.getElementById("emptyCreateBtn");
const closeModal = document.getElementById("closeModal");
const cancelBtn = document.getElementById("cancelBtn");
const pollForm = document.getElementById("pollForm");
const questionInput = document.getElementById("question");
const optionInputs = document.querySelectorAll(".poll-option");
const characterCount = document.getElementById("characterCount");
const submitBtn = document.getElementById("submitBtn");
const formError = document.getElementById("formError");
const toast = document.getElementById("toast");

let currentUser = null;
let polls = [];
let toastTimer;

init();

async function init() {
    try {
        await getUser();
        await getPolls();
        await updateStats();
    } catch (error) {
        console.error(error);
        showError(error.message);
    }
}

async function getUser() {
    const { data, error } = await supabaseClient.auth.getUser();

    if (error) {
        console.error("User error:", error);
        return;
    }

    currentUser = data.user;
}

async function getPolls() {
    showLoading();
    hideError();

    const { data, error } = await supabaseClient
        .from("polls")
        .select(`
            id,
            question,
            created_by,
            created_at,
            poll_options (
                id,
                option_text
            )
        `)
        .order("created_at", {
            ascending: false
        });

    if (error) {
        console.error("Poll fetch error:", error);
        showError(error.message);
        hideLoading();
        return;
    }

    polls = data || [];

    await renderPolls(polls);

    hideLoading();
}

async function renderPolls(pollData) {
    pollList.innerHTML = "";

    if (pollData.length === 0) {
        emptyState.hidden = false;
        return;
    }

    emptyState.hidden = true;

    for (const poll of pollData) {
        const card = await createPollCard(poll);
        pollList.appendChild(card);
    }
}

async function createPollCard(poll) {
    const card = document.createElement("article");

    card.className = "poll-card";

    const { data: votes, error } = await supabaseClient
        .from("votes")
        .select("id, user_id, option_id")
        .eq("poll_id", poll.id);

    if (error) {
        console.error("Vote fetch error:", error);
    }

    const voteData = votes || [];
    const totalVotes = voteData.length;

    let userVote = null;

    if (currentUser) {
        userVote = voteData.find(
            vote => vote.user_id === currentUser.id
        );
    }

    let optionsHTML = "";

    poll.poll_options.forEach(option => {
        const optionVotes = voteData.filter(
            vote => vote.option_id === option.id
        ).length;

        const percentage =
            totalVotes === 0
                ? 0
                : Math.round((optionVotes / totalVotes) * 100);

        if (userVote) {
            optionsHTML += `
                <div class="result-row">
                    <div class="result-top">
                        <span>${escapeHTML(option.option_text)}</span>
                        <strong>${percentage}%</strong>
                    </div>

                    <div class="progress">
                        <div
                            class="progress-bar"
                            style="width:${percentage}%"
                        ></div>
                    </div>
                </div>
            `;
        } else {
            optionsHTML += `
                <label class="poll-option-label">
                    <input
                        type="radio"
                        name="poll-${poll.id}"
                        value="${option.id}"
                    >

                    <span class="radio"></span>

                    <span class="option-name">
                        ${escapeHTML(option.option_text)}
                    </span>
                </label>
            `;
        }
    });

    card.innerHTML = `
        <div class="poll-top">
            <span class="poll-badge">
                COMMUNITY
            </span>

            <span class="poll-date">
                ${formatDate(poll.created_at)}
            </span>
        </div>

        <h3>
            ${escapeHTML(poll.question)}
        </h3>

        <div class="poll-options">
            ${optionsHTML}
        </div>

        <div class="poll-footer">
            <span class="votes-count">
                ${totalVotes}
                ${totalVotes === 1 ? "vote" : "votes"}
            </span>

            ${userVote
            ? `
                        <span class="already-voted">
                            ✓ You voted
                        </span>
                    `
            : `
                        <button
                            class="vote-btn"
                            data-poll-id="${poll.id}"
                        >
                            Vote →
                        </button>
                    `
        }
        </div>
    `;

    if (!userVote) {
        const button = card.querySelector(".vote-btn");

        button.addEventListener("click", () => {
            vote(poll.id, card);
        });
    }

    return card;
}

async function vote(pollId, card) {
    if (!currentUser) {
        showToast(
            "Please login before voting.",
            "error"
        );
        return;
    }

    const selected = card.querySelector(
        `input[name="poll-${pollId}"]:checked`
    );

    if (!selected) {
        showToast(
            "Please select an option.",
            "error"
        );
        return;
    }

    const optionId = selected.value;
    const button = card.querySelector(".vote-btn");

    button.disabled = true;
    button.textContent = "Voting...";

    const { error } = await supabaseClient
        .from("votes")
        .insert({
            poll_id: pollId,
            option_id: optionId,
            user_id: currentUser.id
        });

    if (error) {
        console.error("Vote error:", error);

        if (error.code === "23505") {
            showToast(
                "You have already voted in this poll.",
                "error"
            );
        } else {
            showToast(
                error.message,
                "error"
            );
        }

        button.disabled = false;
        button.textContent = "Vote →";
        return;
    }

    showToast(
        "Your vote has been recorded!",
        "success"
    );

    await getPolls();
    await updateStats();
}

pollForm.addEventListener("submit", async function (event) {
    event.preventDefault();

    clearFormError();

    if (!currentUser) {
        showFormError(
            "Please login before creating a poll."
        );
        return;
    }

    const question = questionInput.value.trim();

    const options = Array.from(optionInputs)
        .map(input => input.value.trim())
        .filter(option => option !== "");

    if (question.length < 5) {
        showFormError(
            "Question must contain at least 5 characters."
        );
        return;
    }

    if (options.length < 2) {
        showFormError(
            "Please add at least 2 options."
        );
        return;
    }

    if (options.length > 5) {
        showFormError(
            "You can add a maximum of 5 options."
        );
        return;
    }

    const lowercaseOptions = options.map(
        option => option.toLowerCase()
    );

    if (
        new Set(lowercaseOptions).size !==
        lowercaseOptions.length
    ) {
        showFormError(
            "Poll options must be different."
        );
        return;
    }

    setButtonLoading(true);

    try {
        const {
            data: poll,
            error: pollError
        } = await supabaseClient
            .from("polls")
            .insert({
                question: question,
                created_by: currentUser.id
            })
            .select()
            .single();

        if (pollError) {
            throw pollError;
        }

        const optionRows = options.map(option => ({
            poll_id: poll.id,
            option_text: option
        }));

        const {
            error: optionError
        } = await supabaseClient
            .from("poll_options")
            .insert(optionRows);

        if (optionError) {
            await supabaseClient
                .from("polls")
                .delete()
                .eq("id", poll.id);

            throw optionError;
        }

        showToast(
            "Poll created successfully!",
            "success"
        );

        pollForm.reset();

        characterCount.textContent = "0";

        closePollModal();

        await getPolls();
        await updateStats();

    } catch (error) {
        console.error(
            "Create poll error:",
            error
        );

        showFormError(
            error.message
        );
    } finally {
        setButtonLoading(false);
    }
});

async function updateStats() {
    const {
        count: pollsTotal,
        error: pollsError
    } = await supabaseClient
        .from("polls")
        .select("id", {
            count: "exact",
            head: true
        });

    if (!pollsError) {
        pollCount.textContent = pollsTotal || 0;
    }

    const {
        data: allVotes,
        error: votesError
    } = await supabaseClient
        .from("votes")
        .select("id, user_id");

    if (votesError) {
        console.error(
            "Stats vote error:",
            votesError
        );
        return;
    }

    voteCount.textContent = allVotes.length;

    if (currentUser) {
        const myVotes = allVotes.filter(
            vote => vote.user_id === currentUser.id
        );

        yourVoteCount.textContent = myVotes.length;
    } else {
        yourVoteCount.textContent = "0";
    }
}

searchInput.addEventListener("input", function () {
    const search = this.value
        .trim()
        .toLowerCase();

    const filtered = polls.filter(
        poll =>
            poll.question
                .toLowerCase()
                .includes(search)
    );

    renderPolls(filtered);
});

function openPollModalFunc() {
    if (!currentUser) {
        showToast(
            "Please login before creating a poll.",
            "error"
        );
        return;
    }

    modal.classList.add("show");
}

function closePollModal() {
    modal.classList.remove("show");
    clearFormError();
}

openPollModal.addEventListener(
    "click",
    openPollModalFunc
);

emptyCreateBtn.addEventListener(
    "click",
    openPollModalFunc
);

closeModal.addEventListener(
    "click",
    closePollModal
);

cancelBtn.addEventListener(
    "click",
    closePollModal
);

modal.addEventListener("click", function (event) {
    if (event.target === modal) {
        closePollModal();
    }
});

document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
        closePollModal();
    }
});

questionInput.addEventListener("input", function () {
    characterCount.textContent = this.value.length;
});

function setButtonLoading(loadingState) {
    submitBtn.disabled = loadingState;

    if (loadingState) {
        submitBtn.innerHTML = "Creating...";
    } else {
        submitBtn.innerHTML = "Create Poll <span>→</span>";
    }
}

function showFormError(message) {
    formError.textContent = message;
    formError.hidden = false;
}

function clearFormError() {
    formError.textContent = "";
    formError.hidden = true;
}

function showLoading() {
    loading.style.display = "flex";
}

function hideLoading() {
    loading.style.display = "none";
}

function showError(message) {
    errorState.hidden = false;
    errorText.textContent = message;
}

function hideError() {
    errorState.hidden = true;
}

retryBtn.addEventListener("click", async function () {
    hideError();
    await getPolls();
    await updateStats();
});

function showToast(message, type) {
    clearTimeout(toastTimer);

    toast.textContent = message;
    toast.className = `toast show ${type}`;

    toastTimer = setTimeout(function () {
        toast.className = "toast";
    }, 3000);
}

function formatDate(date) {
    return new Date(date).toLocaleDateString(
        "en-US",
        {
            month: "short",
            day: "numeric",
            year: "numeric"
        }
    );
}

function escapeHTML(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}