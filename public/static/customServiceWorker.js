self.addEventListener('push', (event)=>{
    if (event.data) {
        const data = event.data.json();
        const promiseChain = self.ServiceWorkerRegistration.showNotification(data.title, {
            body:"It works"
        });
        event.waitUntil(promiseChain);
    }
});