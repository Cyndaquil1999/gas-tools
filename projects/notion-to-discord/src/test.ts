function testGetTasksForDate(): void {
  const testDate = new Date();
  Logger.log("テスト対象の日付: %s", testDate);

  const tasks = getTasksForDate(testDate);

  if (tasks.length === 0) {
    Logger.log("タスクはありません。");
    return;
  }

  tasks.forEach((task: any) => {
    const title = task.properties["名前"]?.title?.[0]?.plain_text || "（無題）";
    const date = task.properties["Date"]?.date?.start || "日付未設定";
    Logger.log("タスク: タイトル=%s, 日付=%s", title, date);
  });
}
