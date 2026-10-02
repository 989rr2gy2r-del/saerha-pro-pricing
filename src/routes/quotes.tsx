              </TableHeader>
              <TableBody>
                {quotes.map((q) => (
                  <TableRow key={q.id}>
                    <TableCell className="text-center">
                      <input
                        type="checkbox"
                        aria-label={`تحديد عرض السعر ${q.reference}`}
                        checked={selectedQuoteIds.includes(q.id)}
                        onChange={() => toggleQuoteSelection(q.id)}
                        className="h-4 w-4"
                      />
                    </TableCell>
                    <TableCell className="num font-bold">
                      <button
                        type="button"
                        className="cursor-pointer underline-offset-4 hover:underline focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                        onClick={() => setOpen(q)}
                        aria-label={`معاينة عرض السعر ${q.reference}`}
                      >
                        {q.reference}
                      </button>
                    </TableCell>
                    <TableCell>{getCustomerName(q.customers)}</TableCell>
                    <TableCell className="num">{q.issue_date}</TableCell>
                    <TableCell className="num">{q.expiry_date}</TableCell>
                    <TableCell>{q.price_type}</TableCell>
                    <TableCell className="num">
                      {Number(q.discount_amount ?? 0).toFixed(3)}
                    </TableCell>
                    <TableCell className="num">{Number(q.total ?? 0).toFixed(3)} KWD</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{q.status}</Badge>
                    </TableCell>
                    <TableCell>
                       <div className="flex flex-wrap gap-1">
                         <Button variant="ghost" size="sm" onClick={() => openQuoteForEditing(q)}>
                           <FolderOpen className="ml-1 h-4 w-4" /> فتح
                         </Button>
                         <Button variant="ghost" size="sm" onClick={() => void downloadPdf(q)}>PDF</Button>
                         <Button variant="ghost" size="sm" onClick={() => downloadExcel(q)}>
                           <FileSpreadsheet className="ml-1 h-4 w-4" /> Excel
                         </Button>
                         <Button variant="ghost" size="sm" onClick={() => void openWhatsApp(q)}>
                           <MessageCircle className="ml-1 h-4 w-4" /> واتساب