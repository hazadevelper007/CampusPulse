# CampusPulse Backend

## Local setup

```powershell
cd Code/BACKEND
C:/Users/A/AppData/Local/Programs/Python/Python314/python.exe -m pip install -r requirements.txt
C:/Users/A/AppData/Local/Programs/Python/Python314/python.exe app.py
```

The API and frontend run together at <http://127.0.0.1:5000>.

By default, Flask uses a local SQLite database. Set `DATABASE_URL` to a MySQL URL such as `mysql+pymysql://root:@localhost/campuspulse` and import `schema.sql` before switching to XAMPP/MySQL.

## Demo accounts

- Student: `student@campuspulse.local` / `password`
- Lab Assistant: `assistant@campuspulse.local` / `password`
- Admin: `admin@campuspulse.local` / `password`
