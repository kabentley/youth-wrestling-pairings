<?xml version="1.0" encoding="utf-8" ?>

<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform" >
<xsl:output method="html"/>

  <xsl:template match="Meet">
    <html>

      <head>
        <style type="text/css">
         <xsl:for-each select="Team">
            .<xsl:value-of select="@Symbol"/>{color:<xsl:value-of select="@Color"/> }
          </xsl:for-each>
          @media print {
           .break{page-break-before: always;}
          body {font-size: 10pt; background: white;}
          div.headers {display: none;}
          }
        </style>  
        
        <script language="javascript">
          var showMode = 'table-cell'; if (document.all) showMode='block';
          function toggleVis(btn){
          mode  = btn.checked ? showMode : 'none';
          var t = document.getElementsByTagName("body")[0].getElementsByTagName("table");
          for (var i=0; i &lt; t.length; i++){var e = t[i].getElementsByTagName ("col");
          for (var j=0; j &lt; e.length; j++){if (e[j].className == "awe"){e[j].style.display= mode;}}}
          }
        </script>

      </head>
      <body>
        <div class="headers">
        <h1>
          Meet: <xsl:value-of select="@Name"/>
        </h1>
        <form name="showawe" onsubmit="return false">
          <p>Show Age, Weight, and Experience Columns?<input type="checkbox" onclick="toggleVis(this)" checked=""/></p>
        </form>
        </div>
        
        <xsl:for-each select="Team">
          <xsl:variable name="teamsym">
            <xsl:value-of select="@Symbol"/>
          </xsl:variable>
          <h2 >
            <xsl:attribute name="class">
              <xsl:value-of select="$teamsym"/>
            </xsl:attribute>
            <xsl:value-of select="@Name"/>
          </h2>
          <table>
            <col class="awe" align="center" width="50"/>
            <col class="awe" align="center" width="50"/>
            <col class="awe" align="center" width="50"/>
            <col align="left" width="150"/>
            <col align="left" width="150"/>
            <col align="left" width="150"/>
            <col align="left" width="150"/>

            <tr bgcolor="lightgrey" >
              <th>Age</th>
              <th>Weight</th>
              <th>Exp</th>
              <th>Wrestler Name</th>
              <th>Matches</th>
            </tr>
            <xsl:for-each select="Member">
              <tr>
                <td>
                  <xsl:value-of select="@Age"/>
                </td>
                <td>
                  <xsl:value-of select="@Weight"/>
                </td>
                <td>
                  <xsl:value-of select="@Experience"/>
                </td>
                <td>
                  <xsl:attribute name="class">
                    <xsl:value-of select="$teamsym"/>
                  </xsl:attribute>
                  <xsl:value-of select="@LastName"/>, <xsl:value-of select="@FirstName"/>
                </td>
                <xsl:for-each select="Bout">
                  <td>
                    <xsl:attribute name="class">
                      <xsl:value-of select="@OppTeam"/>
                    </xsl:attribute>
                    <info xml:space="preserve">
                    <xsl:value-of select="@Number"/> <xsl:value-of select="@Opponent"/>
                      </info>
                  </td>
                </xsl:for-each>
              </tr>
            </xsl:for-each>
          </table>
          <p class="break"/>
        </xsl:for-each>

        <xsl:for-each select="Mat">
          <h2 class="break">
            <xsl:value-of select="@Name"/>
          </h2>
          <table cellspacing="6">
            <col align="center" width="50"/>
            <col align="center" width="50"/>
            <col align="left" width="160"/>
            <col align="center" width="50"/>
            <col align="left" width="160"/>

            <tr bgcolor="lightgrey" >
              <th>Match</th>
              <th>Team</th>
              <th>Wrestler 1</th>
              <th>Team</th>
              <th>Wrestler 2</th>
            </tr>
            <xsl:for-each select="MatBout">
              <tr>
                <td>
                  <xsl:value-of select="@Number"/>
                </td>
                <td>
                  <xsl:attribute name="class">
                    <xsl:value-of select="Wrestler1/@Team"/>
                  </xsl:attribute>

                  <xsl:value-of select="Wrestler1/@Team"/>
                </td>
                <td>
                  <xsl:attribute name="class">
                    <xsl:value-of select="Wrestler1/@Team"/>
                  </xsl:attribute>
                  <xsl:value-of select="Wrestler1/@Name"/>
                </td>
                <td>
                  <xsl:attribute name="class">
                    <xsl:value-of select="Wrestler2/@Team"/>
                  </xsl:attribute>
                  <xsl:value-of select="Wrestler2/@Team"/>
                </td>
                <td>
                  <xsl:attribute name="class">
                    <xsl:value-of select="Wrestler2/@Team"/>
                  </xsl:attribute>
                  <xsl:value-of select="Wrestler2/@Name"/>
                </td>
              </tr>
            </xsl:for-each>
          </table>
        </xsl:for-each>

      </body>

  </html>
  </xsl:template>

</xsl:stylesheet>