# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - status [ref=e2]:
    - generic [ref=e3]:
      - img [ref=e5]
      - generic [ref=e7]:
        - text: Static route
        - button "Hide static indicator" [ref=e8] [cursor=pointer]:
          - img [ref=e9]
  - alert [ref=e12]
  - generic [ref=e13]:
    - complementary [ref=e14]:
      - generic [ref=e15]:
        - paragraph [ref=e16]: Businesses
        - list [ref=e17]:
          - listitem [ref=e18]:
            - link "e2e-test-co" [ref=e19] [cursor=pointer]:
              - /url: /chat/e2e-test-co
    - link "Admin" [ref=e21] [cursor=pointer]:
      - /url: /admin
    - generic [ref=e22]:
      - banner [ref=e23]:
        - generic [ref=e24]: "Businesses: 2 Agents: 6"
        - generic [ref=e25]:
          - button "Stop" [ref=e26]
          - link "Finance" [ref=e27] [cursor=pointer]:
            - /url: /finance/e2e-test-co
          - button "QR" [ref=e28]
      - generic [ref=e33]:
        - heading "What business we launching today?" [level=2] [ref=e34]
        - generic [ref=e37]:
          - textbox "I want to launch a dog meme newsletter and tiktok channel..." [ref=e38]
          - button "Send" [disabled] [ref=e39]:
            - img [ref=e40]
```