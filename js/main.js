/* jshint curly:true, debug:true */
/* globals $, firebase, location, moment */

// プロフィール画像を設定していないユーザのデフォルト画像
var defaultProfileImageURL = "img/default-profile-image.png";

// 初期ルーム名
var defaultRoomName = "default";

// 現在表示しているルーム名
var currentRoomName = null;

// 現在ログインしているユーザID
var currentUID;

// Firebaseから取得したデータを一時保存しておくための変数
var dbdata = {};


/**
 * すべての画面共通で使う関数
 */

// ビュー（画面）を変更する
function showView(id) {
  $(".view").hide();
  $("#" + id).fadeIn();

  if (id === "chat") {
    loadChatView();
  }
}


/**
 * ログイン・ログアウト関連の関数
 */

// ログインフォームを初期状態に戻す
function resetLoginForm() {
  $(".form-group").removeClass("has-error");
  $(".login__help").hide();
  $(".login__submit-button").removeAttr("disabled").text("ログイン");
}

// ログインした直後に呼ばれる
function onLogin() {
  console.log("ログイン完了");

  // チャット画面を表示
  showView("chat");
}

// ログアウトした直後に呼ばれる
function onLogout() {
  firebase.database().ref("users").off("value");
  firebase.database().ref("rooms").off("value");
  currentRoomName = null;
  dbdata = {};
  resetLoginForm();
  resetChatView();
  resetSettingsModal();
  resetFavoritesListModal();  // お気に入り一覧のモーダルを初期化
  showView("login");
}


/**
 * チャット画面関連の関数
 */

// チャット画面の初期化処理
function loadChatView() {
  resetChatView();

  dbdata = {}; // キャッシュデータを空にする

  // ユーザ一覧を取得してさらに変更を監視
  var usersRef = firebase.database().ref("users");
  // 過去に登録したイベントハンドラを削除
  usersRef.off("value");
  // イベントハンドラを登録
  usersRef.on("value", function(usersSnapshot) {
    // usersに変更があるとこの中が実行される

    dbdata.users = usersSnapshot.val();

    // 自分のユーザデータが存在しない場合は作成
    if (dbdata.users === null || !dbdata.users[currentUID]) {
      var currentUser = firebase.auth().currentUser;
      if (currentUser) {
        console.log("ユーザデータを作成します");
        firebase.database().ref("users/" + currentUID).set({
          nickname: currentUser.email,
          createdAt: firebase.database.ServerValue.TIMESTAMP,
          updatedAt: firebase.database.ServerValue.TIMESTAMP,
        });

        // このコールバック関数が再度呼ばれるのでこれ以上は処理しない
        return;
      }
    }

    for (var uid in dbdata.users) {
      updateNicknameDisplay(uid);
      downloadProfileImage(uid);
    }

    // usersとroomsが揃ったらルームを表示（初回のみ）
    if (currentRoomName === null && dbdata.rooms) {
      showCurrentRoom();
    }
  });

  // ルーム一覧を取得してさらに変更を監視
  var roomsRef = firebase.database().ref("rooms");
  // 過去に登録したイベントハンドラを削除
  roomsRef.off("value");
  // コールバックを登録
  roomsRef.on("value", function(roomsSnapshot) {
    // roomsに変更があるとこの中が実行される

    dbdata.rooms = roomsSnapshot.val();

    // 初期ルームが存在しない場合は作成する
    if (dbdata.rooms === null || !dbdata.rooms[defaultRoomName]) {
      console.log(defaultRoomName + "ルームを作成します");
      firebase.database().ref("rooms/" + defaultRoomName).setWithPriority({
        createdAt: firebase.database.ServerValue.TIMESTAMP,
        createdByUID: currentUID,
      }, 1);

      // このコールバック関数が再度呼ばれるのでこれ以上は処理しない
      return;
    }

    // ルーム一覧をナビゲーションメニューに表示
    showRoomList(roomsSnapshot);

    // usersデータがまだ来ていない場合は何もしない
    if (!dbdata.users) {
      return;
    }

    showCurrentRoom();
  });
  
  // お気に入りデータを取得
  var favoritesRef = firebase.database().ref("favorites/" + currentUID).orderByChild("createdAt");

  // 過去に登録したイベントハンドラを削除
  favoritesRef.off("child_removed");
  favoritesRef.off("child_added");

  // favorites の child_removedイベントハンドラを登録
  // （お気に入りが削除されたときの処理）
  favoritesRef.on("child_removed", function(favSnapshot) {
    var messageId = favSnapshot.key;
    
    // お気に入りが削除されていたら何もしない
    if (!dbdata.favorites) {
      return;
    }

    // TODO: 該当するデータをdbdata.favoritesから削除する
    dbdata.favorites[messageId] = null;
    
    // お気に入り一覧モーダルから該当のお気に入り情報を削除する
    $("#favorite-message-id-" + messageId).remove();
    
    // TODO: お気に入りリンクの glyphicon を glyphicon-star-empty に変更する
    $("#message-id-" + messageId).find('a').find('span').addClass('glyphicon-star-empty');
    $("#message-id-" + messageId).find('a').find('span').removeClass('glyphicon-star');

  });

  // favorites の child_addedイベントハンドラを登録
  // （お気に入���が追加されたときの処理）
  favoritesRef.on("child_added", function(favSnapshot) {
    var messageId = favSnapshot.key;
    var favorite = favSnapshot.val();
    
    console.log("完了");

    if (!dbdata.favorites) {
      // データを初期化する
      dbdata.favorites = {};
    }

    // TODO: dbdata.favoritesに登録する
    dbdata.favorites[messageId] = favorite;
    
    // お気に入り一覧モーダルを更新する
    addFavoriteMessage(messageId, favorite.message);
    
    // TODO: お気に入りリンクの glyphicon を glyphicon-star に変更する
    
    $("#message-id-" + messageId).find('a').find('span').addClass('glyphicon-star');
    $("#message-id-" + messageId).find('a').find('span').removeClass('glyphicon-star-empty');
  });
}

// チャット画面表示用のデータが揃った時に呼ばれる
function showCurrentRoom() {
  if (currentRoomName) {
    if (!dbdata.rooms[currentRoomName]) {
      // 現在いるルームが削除されたため初期ルームに移動
      showRoom(defaultRoomName);
    }
  } else { // ページロード直後の場合
    if (location.hash) { // URLの#以降がある場合はそのルームを表示
      var roomName = decodeURIComponent(location.hash.substring(1));
      if (dbdata.rooms[roomName]) {
        _showRoom(roomName);
      } else { // ルームが存在しないので初期ルームを表示
        showRoom(defaultRoomName);
      }
    } else { // #指定がないので初期ルームを表示
      showRoom(defaultRoomName);
    }
  }
}

// チャットビュー内のユーザ情報をクリア
function resetChatView() {
  // メッセージ一覧を消去
  clearMessages();

  // ナビゲーションバーの情報を消去
  clearNavbar();

  // ユーザ情報設定モーダルのプレビュー画像を消去
  $(".settings-profile-image-preview").attr({
    src: defaultProfileImageURL,
  });
}

// ナビゲーションバーの情報を消去
function clearNavbar() {
  $(".room-list-menu").text("ルーム");
  $(".menu-profile-name").text("");
  $(".menu-profile-image").attr({
    src: defaultProfileImageURL,
  });
  clearRoomList();
}

// 動的に追加されたルームを一旦削除する
function clearRoomList() {
  $(".room-list").find(".room-list-dynamic").remove();
}

// ルーム一覧をナビゲーションメニュー内に表示する
function showRoomList(roomsSnapshot) {
  // 動的に追加されたルームを一旦削除する
  clearRoomList();

  roomsSnapshot.forEach(function(roomSnapshot) {
    var roomName = roomSnapshot.key;
    var roomListLink = $("<a>", {
      href: "#" + roomName,
      class: "room-list__link",
    }).text(roomName);
    $(".room-list").append(
      $("<li>", {
        class: "room-list-dynamic",
      }).append(roomListLink)
    );
    roomListLink.click(function() {
      // ハンバーガーメニューが開いている場合は閉じる
      $("#navbar").collapse("hide");
    });
  });
}

// .message-listの高さを調整する。主にMobile Safari向け。
function setMessageListMinHeight() {
  $(".message-list").css({
    // $(window).height() (ブラウザウインドウの高さ)
    // - 51 (ナビゲーションバーの高さ)
    // - 46 (投稿フォームの高さ)
    // + 6 (投稿フォームのborder-radius)
    "min-height": ($(window).height() - 51 - 46 + 6) + "px",
  });
}

// messageを表示する
function addMessage(messageId, message) {
  var divTag = createMessageDiv(messageId, message);
  divTag.appendTo(".message-list");

  // 一番下までスクロール 
  $("html, body").scrollTop($(document).height());
}

// messageの表示用のdiv（jQueryオブジェクト）を作って返す
function createMessageDiv(messageId, message) {
  // HTML内のテンプレートからコピーを作成
  var divTag = null;
  if (message.uid === currentUID) { // 送信メッセージ
    divTag = $(".message-template .message--sent").clone();
  } else { // 受信メッセージ
    divTag = $(".message-template .message--received").clone();
  }

  var user = dbdata.users[message.uid];
  if (user) { // ユーザが存在する場合
    // 投稿者ニックネーム
    divTag.find(".message__user-name").addClass("nickname-" + message.uid).text(user.nickname);
    // 投稿者プロフィール画像
    divTag.find(".message__user-image").addClass("profile-image-" + message.uid);
    if (user.profileImageURL) { // プロフィール画像のURLを取得済みの場合
      divTag.find(".message__user-image").attr({
        src: user.profileImageURL,
      });
    }
  }
  // メッセージ本文
  divTag.find(".message__text").text(message.text);
  // 投稿日
  divTag.find(".message__time").html(formatDate(new Date(message.time)));

  // id属性をセット
  divTag.attr("id", "message-id-" + messageId);
  
  // お気に入りボタンのイベントハンドラを登録
  var mfl = divTag.find(".message__favorite-link");
  mfl.bind("click", {
    messageId: messageId,
    message: message
  }, toggleFavorite);
  
  // TODO: お気に入りONのとき、お気に入りリンクの glyphicon を設定する（glyphicon-star）
  if(dbdata.favorites && dbdata.favorites[messageId]) {
    divTag.find(".message__favorite").addClass('glyphicon-star');
    divTag.find(".message__favorite").removeClass('glyphicon-star-empty');
    
  }

  return divTag;
}

// DateオブジェクトをHTMLにフォーマットして返す
function formatDate(date) {
  var m = moment(date);
  return m.format("YYYY/MM/DD") + "&nbsp;&nbsp;" + m.format("HH:mm:ss");
}

// ルームを表示する。location.hashを変更すること���
// onhashchangeが呼ばれ、そこから_showRoom()が呼ばれる。
function showRoom(roomName) {
  location.hash = encodeURIComponent(roomName);
}

// 表示されているメッセージを消去
function clearMessages() {
  $(".message-list").empty();
}

// ルームを実際に表示する
function _showRoom(roomName) {
  if (!dbdata.rooms || !dbdata.rooms[roomName]) {
    console.error("該当するルームがありません:", roomName);
    return;
  }
  currentRoomName = roomName;
  clearMessages();

  // ルームのメッセージ一覧をダウンロードし、かつメッセージの追加を監視
  var roomRef = firebase.database().ref("messages/" + roomName);
  // 過去に登録したイベントハンドラを削除
  roomRef.off("child_added");
  // イベントハンドラを登録
  roomRef.on("child_added", function(childSnapshot, prevChildKey) {
    if (roomName === currentRoomName) {
      // 追加されたメッセージを表示
      addMessage(childSnapshot.key, childSnapshot.val());
    }
  });

  // ナビゲーションバーのルーム表示を更新
  $(".room-list-menu").text("ルーム: " + roomName);

  // 初期ルームの場合はルーム削除メニューを無効にする
  if (roomName === defaultRoomName) {
    $(".delete-room-menuitem").addClass("disabled");
  } else {
    $(".delete-room-menuitem").removeClass("disabled");
  }

  // ナビゲーションのドロップダウンメニューで現在のルームをハイライトする
  $(".room-list > li").removeClass("active");
  $(".room-list__link[href='#" + roomName + "']").closest("li").addClass("active");
}

// ルーム作成モーダルの内容をリセットする
function resetCreateRoomModal() {
  $("#create-room-form")[0].reset();
  $(".create-room__room-name").removeClass("has-error");
  $(".create-room__help").hide();
}

// ルームを削除する
// なおルームが削除されると roomsRef.on("value", ...); の内容が実行され、初期ルームに移動する
function deleteRoom(roomName) {
  // 初期ルームは削除不可
  if (roomName === defaultRoomName) {
    throw new Error(defaultRoomName + "ルームは削除できません");
  }

  // ルームを削除
  firebase.database().ref("rooms/" + roomName).remove();

  // ルーム内のメッセージも削除
  firebase.database().ref("messages/" + roomName).remove();
}


/**
 * ユーザ情報設定関連の関数
 */

// settingsModalを初期状態に戻す
function resetSettingsModal() {
  $(".settings-form")[0].reset();
}

// ニックネーム表示を更新する
function updateNicknameDisplay(uid) {
  var user = dbdata.users[uid];
  if (user) {
    $(".nickname-" + uid).text(user.nickname);
    if (uid === currentUID) {
      $(".menu-profile-name").text(user.nickname);
    }
  }
}

// プロフィール画像の表示を更新する
function updateProfileImageDisplay(uid, url) {
  $(".profile-image-" + uid).attr({
    src: url,
  });
  if (uid === currentUID) {
    $(".menu-profile-image").attr({
      src: url,
    });
  }
}

// プロフィール画像をダウンロードして表示する
function downloadProfileImage(uid) {
  var user = dbdata.users[uid];
  if (!user) {
    return;
  }
  if (user.profileImageLocation) {
    // profile-images/abcdef のようなパスから画像のダウンロードURLを取得
    firebase.storage().ref().child(user.profileImageLocation).getDownloadURL().then(function(url) {
      // 画像URL取得成功
      user.profileImageURL = url;
      updateProfileImageDisplay(uid, url);
    }).catch(function(error) {
      console.error("写真のダウンロードに失敗:", error);
      user.profileImageURL = defaultProfileImageURL;
      updateProfileImageDisplay(uid, defaultProfileImageURL);
    });
  } else { // プロフィール画像が未設定の場合
    user.profileImageURL = defaultProfileImageURL;
    updateProfileImageDisplay(uid, defaultProfileImageURL);
  }
}

/**
 * お気に入り関連の関数
 */
// favoriteを表示する
function addFavoriteMessage(messageId, message) {
  var divTag = createFavoriteMessageDiv(messageId, message);
  divTag.appendTo(".favorite-list");
}

// favoriteの表示用のdiv（jQueryオブジェクト）を作って返す
function createFavoriteMessageDiv(messageId, message) {
  // HTML内のテンプレートからコピーを作成
  var divTag = $(".favorite-template .list-group-item").clone();

  var user = dbdata.users[message.uid];
  if (user) { // ユーザが存在する場合
    // 投稿者ニックネーム
    divTag.find(".favorite__user-name").addClass("nickname-" + message.uid).text(user.nickname);
    // 投稿者プロフィール画像
    divTag.find(".favorite__user-image").addClass("profile-image-" + message.uid);
    
    if (user.profileImageURL) { // プロフィール画像のURLを取得済みの場合
      divTag.find(".favorite__user-image").attr({
        src: user.profileImageURL,
      });
    }
  }
  // メッセージ本文
  divTag.find(".favorite__text").text(message.text);
  // 投稿日
  divTag.find(".favorite__time").html(formatDate(new Date(message.time)));

  // id属性をセット
  divTag.attr("id", "favorite-message-id-" + messageId);

  return divTag;
}

// Realtime Database の favorites に追加する or favorites から削除する
function toggleFavorite(event) {
  var messageId = event.data.messageId;
  var message = event.data.message;
  
  // favorites にデータが存在しているか
  if(dbdata.favorites && dbdata.favorites[messageId]) {
    // TODO: favorites から該当のお気に入り情報を削除
    firebase.database().ref("favorites/"+currentUID+"/"+messageId).remove();
  } else {
    // TODO: favorites に該当のメッセージをお気に入りとして追加
    firebase.database().ref("favorites/"+currentUID+"/"+messageId).set({
      createdAt: firebase.database.ServerValue.TIMESTAMP,
      message: message,
    });
  }
  
  // 変な遷移をさせないよう false を戻す
  return false;
}

// お気に入り一覧のモーダルを初期化
function resetFavoritesListModal() {
  $(".favorite-list").empty();
}


$(document).ready(function() {
  // ページロード時に実行する処理。DOM操作が絡む処理はここに入れる。

  /**
   * ログイン・ログアウト関連
   */

  // ログイン状態の変化を監視する
  firebase.auth().onAuthStateChanged(function(user) {
    // ログイン状態が変化した

    // トークンリフレッシュのイベントは無視
    if ((user && currentUID === user.uid) || (!user && currentUID === null)) {
      return;
    }

    if (user) { // ログイン済
      currentUID = user.uid;
      onLogin();
    } else { // 未ログイン
      currentUID = null;
      onLogout();
    }
  });

  // ログインフォームが送信されたらログインする
  $("#login-form").submit(function() {
    // フォームを初期状態に戻す
    resetLoginForm();

    // ログインボタンを押せないようにする
    $(".login__submit-button").attr("disabled", "disabled").text("送信中…");

    var email = $("#login-email").val();
    var password = $("#login-password").val();

    // ログインを試みて該当ユーザが存在しない場合は新規作成する
    // まずはログインを試みる
    firebase.auth().signInWithEmailAndPassword(email, password).catch(function(error) {
      console.log("ログイン失敗:", error);
      if (error.code === "auth/user-not-found") {
        // 該当ユーザが存在しない場合は新規作成する
        firebase.auth().createUserWithEmailAndPassword(email, password).then(function() { // 作成成功
          console.log("ユーザを作成しました");
        }).catch(function(error) { // 作成失敗
          console.error("ユーザ作成に失敗:", error);
        });
      }
    });

    return false;
  });

  // ログアウトがクリックされたらログアウトする
  $(".logout__link").click(function() {
    // ハンバーガーメニューが開いている場合は閉じる
    $("#navbar").collapse("hide");

    firebase.auth().signOut().then(function() { // ログアウト成功
      location.hash = "";
    }).catch(function(error) {
      console.error("ログアウトに失敗:", error);
    });

    return false;
  });


  /**
   * チャット画面関連
   */

  // .message-listの高さを調整
  setMessageListMinHeight();

  $(".comment-form").submit(function() {
    var commentForm = $(".comment-form__text");
    var comment = commentForm.val();
    if (comment === "") {
      return false;
    }
    commentForm.val("");

    // メッセージを投稿する
    var message = {
      uid: currentUID,
      text: comment,
      time: firebase.database.ServerValue.TIMESTAMP,
    };
    firebase.database().ref().child("messages/" + currentRoomName).push(message);

    return false;
  });


  /**
   * ルーム作成関連
   */

  $("#createRoomModal").on("show.bs.modal", function(event) {
    // #createRoomModalが表示される直前に実行する処理

    // モーダルの内容をリセット
    resetCreateRoomModal();
  });
  $("#createRoomModal").on("shown.bs.modal", function(event) {
    // #createRoomModalが表示された直後に実行する処理

    // ハンバーガーメニューが開いている場合は閉じる
    $("#navbar").collapse("hide");

    // ルーム名の欄にすぐ入力できる状態にする
    $("#room-name").focus();
  });

  // ルーム作成フォームが送信されたらルームを作成
  $("#create-room-form").submit(function() {
    var roomName = $("#room-name").val();

    // 頭とお尻の空白文字を除去
    roomName = roomName.replace(/^\s+/, "").replace(/\s+$/, "");
    $("#room-name").val(roomName);

    // Firebaseのキーとして使えない文字が含まれているかチェック
    if (/[.$#\[\]\/]/.test(roomName)) {
      $(".create-room__help").text("ルーム名に次の文字は使えません: . $ # [ ] /").fadeIn();
      $(".create-room__room-name").addClass("has-error");
      return false;
    }

    if (roomName.length < 1 || roomName.length > 20) {
      $(".create-room__help").text("1文字以上20文字以内で入力してください").fadeIn();
      $(".create-room__room-name").addClass("has-error");
      return false;
    }

    if (dbdata.rooms[roomName]) {
      $(".create-room__help").text("同じ名前のルームがすでに存在します").fadeIn();
      $(".create-room__room-name").addClass("has-error");
      return false;
    }

    // ルーム作成処理
    // priorityを2にすることで初期ルーム（priority=1）より順番的に後になる
    firebase.database().ref("rooms/" + roomName).setWithPriority({
      createdAt: firebase.database.ServerValue.TIMESTAMP,
      createdByUID: currentUID,
    }, 2)
      .then(function() {
        // ルーム作成に成功した場合は以下2つの処理を実行する
        // モーダルを非表示にする
        $("#createRoomModal").modal("toggle");
        // 作成したルームを表示
        showRoom(roomName);
      })
      .catch(function(error) {
        console.error("ルーム作成に失敗:", error);
      });

    return false;
  });


  /**
   * ルーム削除関連
   */

  $("#deleteRoomModal").on("show.bs.modal", function(event) {
    // ルーム削除のモーダル表示直前に実行する処理

    if (!currentRoomName) {
      return false;
    }

    // 初期ルームは削除不可のためモーダルを表示しない
    if (currentRoomName === defaultRoomName) {
      return false;
    }

    // モーダルの内容をリセット
    $(".delete-room__name").text(currentRoomName);

    // ハンバーガーメニューが開いている場合は閉じる
    $("#navbar").collapse("hide");
  });

  // ルーム削除ボタンクリックでルームを削除する
  $(".delete-room__button").click(function() {
    deleteRoom(currentRoomName);
    $("#deleteRoomModal").modal("toggle");
  });


  /**
   * ユーザ情報設定関連
   */

  $("#settingsModal").on("show.bs.modal", function(event) {
    // #settingsModalが表示される直前に実行する処理

    if (!dbdata.users) {
      return false;
    }

    // ハンバーガーメニューが開いている場合は閉じる
    $("#navbar").collapse("hide");

    // ニックネームの欄に現在の値を入れる
    $("#settings-nickname").val(dbdata.users[currentUID].nickname);

    var user = dbdata.users[currentUID];
    if (user.profileImageURL) { // プロフィール画像のURLをすでに取得済
      $(".settings-profile-image-preview").attr({
        src: user.profileImageURL,
      });
    } else if (user.profileImageLocation) { // プロフィール画像は設定さ��ているがURLは未取得
      firebase.storage().ref().child("profile-images/" + currentUID).getDownloadURL().then(function(url) {
        $(".settings-profile-image-preview").attr({
          src: url,
        });
      });
    }
  });

  // ニックネーム欄の値が変更されたらデータベースに保存する
  $("#settings-nickname").change(function() {
    var newName = $(this).val();
    if (newName.length === 0) {
      // 入力されていない場合は何もしない
      return;
    }
    firebase.database().ref("users/" + currentUID).update({
      nickname: newName,
      updatedAt: firebase.database.ServerValue.TIMESTAMP,
    });
  });

  // プロフィール画像のファイルが指定されたらアップロードする
  $("#settings-profile-image").change(function() {
    if (this.files.length === 0) { // ファイルが選択されていない場合
      return;
    }

    var file = this.files[0];
    var metadata = {
      contentType: file.type,
    };

    // ローディング表示
    $(".settings-profile-image-preview").hide();
    $(".settings-profile-image-loading-container").css({
      display: "inline-block",
    });

    // ファイルアップロードを開始
    firebase.storage().ref("profile-images/" + currentUID).put(file, metadata).then(function(snapshot) {
      // アップロード成功したら画像表示用のURLを取得
      firebase.storage().ref("profile-images/" + currentUID).getDownloadURL().then(function(url) {
        // 画像のロードが終わったらローディング表示を消して画像を表示
        $(".settings-profile-image-preview").load(function() {
          $(".settings-profile-image-loading-container").css({
            display: "none"
          });
          $(this).show();
        });
        $(".settings-profile-image-preview").attr({
          src: url
        });
  
        // ユーザ情報を更新
        firebase.database().ref("users/" + currentUID).update({
          profileImageLocation: "profile-images/" + currentUID,
          updatedAt: firebase.database.ServerValue.TIMESTAMP
        });
      });
    }).catch(function(error) {
      console.error("プロフィール画像のアップロードに失敗:", error);
    });
  });

  // ユーザ情報設定フォームが送信されてもページ遷移しない
  $(".settings-form").submit(function() {
    return false;
  });
});

// URLの#以降が変化したらそのルームを表示する
window.onhashchange = function() {
  if (location.hash.length > 1) {
    _showRoom(decodeURIComponent(location.hash.substring(1)));
  }
};

// ウインドウがリサイズされたら.message-listの高さを再調整
$(window).resize(setMessageListMinHeight);