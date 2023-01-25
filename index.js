import * as dotenv from "dotenv";
dotenv.config();

import mysql from "mysql";

import { Octokit } from "octokit";

const connection = mysql.createConnection({
    host: process.env.MYSQL_HOST,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE
});

const octokit = new Octokit({
    auth: process.env.GITHUB_ACCESS_TOKEN
});

const items = [];

const notifications = await octokit.request("GET /notifications", {
    all: true,
    participating: true
});

for(let index = 0; index < notifications.data.length; index++) {
    const notification = notifications.data[index];

    let subject_url = null;

    if(!notification.repository.private) {
        const thread = await octokit.request("GET " + notification.subject.url);

        subject_url = thread.data.html_url;
    }

    items.push({
        id: notification.id,
        reason: notification.reason,
        updated_at: notification.updated_at,
        
        subject: {
            title: notification.subject.title,
            url: subject_url,
            type: notification.subject.type,
        },

        repository: {
            name: notification.repository.name,
            full_name: notification.repository.full_name,
            description: notification.repository.description,
            url: (notification.repository.private)?(null):(notification.repository.html_url),

            owner: {
                avatar: notification.repository.owner.avatar_url
            }
        }
    });
}

await new Promise((resolve) => {
    connection.connect(async (error) => {
        if(error)
            throw error;

        await Promise.all(items.map((item) => {
            return new Promise((resolveQuery) => {
                connection.query(`SELECT * FROM github WHERE id = ${connection.escape(item.id)}`, async (error, rows) => {
                    if(error)
                        throw error;

                    if(rows.length)
                        return resolveQuery();

                    connection.query(`INSERT INTO github (id, reason, updated_at, subject_title, subject_url, subject_type, repository_name, repository_full_name, repository_description, repository_url, repository_owner_avatar) VALUES (${connection.escape(item.id)}, ${connection.escape(item.reason)}, ${connection.escape(item.updated_at)}, ${connection.escape(item.subject.title)}, ${connection.escape(item.subject.url)}, ${connection.escape(item.subject.type)}, ${connection.escape(item.repository.name)}, ${connection.escape(item.repository.full_name)}, ${connection.escape(item.repository.description)}, ${connection.escape(item.repository.url)}, ${connection.escape(item.repository.owner.avatar)})`, (error) => {
                        if(error)
                            throw error;

                        resolveQuery();
                    });
                });
            });
        }));

        connection.destroy();

        resolve();
    });
});

process.exit();
